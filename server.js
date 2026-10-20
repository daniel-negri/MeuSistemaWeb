
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const porta = process.env.PORT || 3000;
const emailAdmin = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

const db = new Database(path.join(__dirname, 'banco.db'));

db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL
    )
`);

// Adiciona colunas novas sem apagar os usuários existentes
const colunas = db.prepare(
    'PRAGMA table_info(usuarios)'
).all().map(coluna => coluna.name);

if (!colunas.includes('papel')) {
    db.exec(`
        ALTER TABLE usuarios
        ADD COLUMN papel TEXT NOT NULL DEFAULT 'usuario'
    `);
}

if (!colunas.includes('criado_em')) {
    db.exec(`
        ALTER TABLE usuarios
        ADD COLUMN criado_em TEXT NOT NULL DEFAULT ''
    `);
}

if (!colunas.includes('ultimo_acesso')) {
    db.exec(`
        ALTER TABLE usuarios
        ADD COLUMN ultimo_acesso TEXT
    `);
}

db.exec(`
    UPDATE usuarios
    SET criado_em = datetime('now', 'localtime')
    WHERE criado_em = ''
`);

// O e-mail definido pelo responsável recebe permissão de administrador
if (emailAdmin) {
    db.prepare(`
        UPDATE usuarios
        SET papel = 'admin'
        WHERE email = ?
    `).run(emailAdmin);
}

app.use(express.json({ limit: '10kb' }));

if (process.env.NODE_ENV === 'production' &&
    !process.env.SESSION_SECRET) {
    throw new Error('Configure SESSION_SECRET antes de iniciar.');
}

app.use(session({
    secret: process.env.SESSION_SECRET ||
        'chave-temporaria-apenas-para-testes-locais',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 2 * 60 * 60 * 1000
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

function usuarioConectado(req, res, next) {
    if (!req.session.usuarioId) {
        return res.status(401).json({
            mensagem: 'Faça login para continuar.'
        });
    }

    next();
}

function somenteAdmin(req, res, next) {
    if (req.session.papel !== 'admin') {
        return res.status(403).json({
            mensagem: 'Acesso permitido somente ao administrador.'
        });
    }

    next();
}

// CADASTRO
app.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        if (
            typeof nome !== 'string' ||
            typeof email !== 'string' ||
            typeof senha !== 'string'
        ) {
            return res.status(400).json({
                mensagem: 'Preencha todos os campos.'
            });
        }

        const nomeLimpo = nome.trim();
        const emailLimpo = email.trim().toLowerCase();

        if (
            nomeLimpo.length < 2 ||
            nomeLimpo.length > 80 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo) ||
            senha.length < 8 ||
            Buffer.byteLength(senha, 'utf8') > 72
        ) {
            return res.status(400).json({
                mensagem:
                    'Informe um nome válido, um e-mail válido e uma senha de 8 a 72 bytes.'
            });
        }

        const existente = db.prepare(
            'SELECT id FROM usuarios WHERE email = ?'
        ).get(emailLimpo);

        if (existente) {
            return res.status(409).json({
                mensagem: 'Este e-mail já está cadastrado.'
            });
        }

        const senhaHash = await bcrypt.hash(senha, 12);
        const papel = emailAdmin && emailLimpo === emailAdmin
            ? 'admin'
            : 'usuario';

        db.prepare(`
            INSERT INTO usuarios
                (nome, email, senha, papel, criado_em)
            VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
        `).run(nomeLimpo, emailLimpo, senhaHash, papel);

        return res.status(201).json({
            mensagem: 'Cadastro realizado com sucesso! Agora faça login.'
        });
    } catch (erro) {
        console.error('Erro no cadastro:', erro.message);

        if (erro.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                mensagem: 'Este e-mail já está cadastrado.'
            });
        }

        return res.status(500).json({
            mensagem: 'Erro interno ao realizar o cadastro.'
        });
    }
});

// LOGIN
app.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (
            typeof email !== 'string' ||
            typeof senha !== 'string' ||
            email.length > 254 ||
            senha.length > 72
        ) {
            return res.status(400).json({
                mensagem: 'Informe o e-mail e a senha.'
            });
        }

        const emailLimpo = email.trim().toLowerCase();

        const usuario = db.prepare(`
            SELECT id, nome, email, senha, papel
            FROM usuarios
            WHERE email = ?
        `).get(emailLimpo);

        if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
            return res.status(401).json({
                mensagem: 'E-mail ou senha incorretos.'
            });
        }

        // Atualiza o último acesso
        db.prepare(`
            UPDATE usuarios
            SET ultimo_acesso = datetime('now', 'localtime')
            WHERE id = ?
        `).run(usuario.id);

        req.session.regenerate((erro) => {
            if (erro) {
                console.error('Erro na sessão:', erro.message);
                return res.status(500).json({
                    mensagem: 'Não foi possível iniciar a sessão.'
                });
            }

            req.session.usuarioId = usuario.id;
            req.session.papel = usuario.papel;

            req.session.save((erroSalvar) => {
                if (erroSalvar) {
                    return res.status(500).json({
                        mensagem: 'Não foi possível salvar a sessão.'
                    });
                }

                return res.json({
                    mensagem: 'Login realizado com sucesso.',
                    usuario: {
                        id: usuario.id,
                        nome: usuario.nome,
                        email: usuario.email,
                        papel: usuario.papel
                    }
                });
            });
        });
    } catch (erro) {
        console.error('Erro no login:', erro.message);
        return res.status(500).json({
            mensagem: 'Erro interno ao realizar o login.'
        });
    }
});

// INFORMAÇÕES DA CONTA CONECTADA
app.get('/sessao', usuarioConectado, (req, res) => {
    const usuario = db.prepare(`
        SELECT id, nome, email, papel, criado_em, ultimo_acesso
        FROM usuarios
        WHERE id = ?
    `).get(req.session.usuarioId);

    if (!usuario) {
        return res.status(401).json({
            mensagem: 'Conta não encontrada.'
        });
    }

    // Sincroniza a permissão guardada na sessão
    req.session.papel = usuario.papel;

    return res.json({ usuario });
});

// LISTA COMPLETA: SOMENTE ADMINISTRADOR
app.get('/api/usuarios',
    usuarioConectado,
    somenteAdmin,
    (req, res) => {
        const usuarios = db.prepare(`
            SELECT id, nome, email, papel, criado_em, ultimo_acesso
            FROM usuarios
            ORDER BY id DESC
        `).all();

        // As senhas e os hashes nunca são enviados ao navegador
        return res.json({ usuarios });
    }
);

// SAIR
app.post('/logout', (req, res) => {
    if (!req.session) {
        return res.json({ mensagem: 'Sessão encerrada.' });
    }

    req.session.destroy((erro) => {
        if (erro) {
            return res.status(500).json({
                mensagem: 'Não foi possível encerrar a sessão.'
            });
        }

        res.clearCookie('connect.sid', {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production'
        });

        return res.json({
            mensagem: 'Você saiu da sua conta.'
        });
    });
});

// PÁGINAS NÃO ENCONTRADAS
app.use((req, res) => {
    res.status(404).json({
        mensagem: 'Endereço não encontrado.'
    });
});

app.listen(porta, () => {
    console.log(`Site disponível em http://localhost:${porta}`);
    console.log(
        emailAdmin
            ? `Administrador configurado: ${emailAdmin}`
            : 'ADMIN_EMAIL não configurado. Nenhuma conta será promovida a admin.'
    );
});
