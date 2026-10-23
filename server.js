
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);

const app = express();
const porta = process.env.PORT || 3000;
const emailAdmin = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    throw new Error('Configure DATABASE_URL no Render.');
}

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error('Configure SESSION_SECRET no Render.');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false
});

app.use(express.json({ limit: '10kb' }));

app.set('trust proxy', 1);

app.use(session({
    store: new PgSession({
        pool: pool,
        tableName: 'sessoes',
        createTableIfMissing: true
    }),
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

        const existente = await pool.query(
            'SELECT id FROM usuarios WHERE email = $1',
            [emailLimpo]
        );

        if (existente.rows.length > 0) {
            return res.status(409).json({
                mensagem: 'Este e-mail já está cadastrado.'
            });
        }

        const senhaHash = await bcrypt.hash(senha, 12);
        const papel = emailAdmin && emailLimpo === emailAdmin
            ? 'admin'
            : 'usuario';

        await pool.query(
            `INSERT INTO usuarios (nome, email, senha, papel)
             VALUES ($1, $2, $3, $4)`,
            [nomeLimpo, emailLimpo, senhaHash, papel]
        );

        return res.status(201).json({
            mensagem: 'Cadastro realizado com sucesso! Agora faça login.'
        });
    } catch (erro) {
        console.error('Erro no cadastro:', erro.message);

        if (erro.code === '23505') {
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

        const resultado = await pool.query(
            `SELECT id, nome, email, senha, papel
             FROM usuarios
             WHERE email = $1`,
            [emailLimpo]
        );

        const usuario = resultado.rows[0];

        if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
            return res.status(401).json({
                mensagem: 'E-mail ou senha incorretos.'
            });
        }

        await pool.query(
            'UPDATE usuarios SET ultimo_acesso = CURRENT_TIMESTAMP WHERE id = $1',
            [usuario.id]
        );

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
                    console.error('Erro ao salvar sessão:', erroSalvar.message);
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
app.get('/sessao', usuarioConectado, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT id, nome, email, papel, criado_em, ultimo_acesso
             FROM usuarios
             WHERE id = $1`,
            [req.session.usuarioId]
        );

        const usuario = resultado.rows[0];

        if (!usuario) {
            return res.status(401).json({
                mensagem: 'Conta não encontrada.'
            });
        }

        req.session.papel = usuario.papel;

        return res.json({ usuario });
    } catch (erro) {
        console.error('Erro ao consultar sessão:', erro.message);
        return res.status(500).json({
            mensagem: 'Erro interno ao consultar a conta.'
        });
    }
});

// LISTA COMPLETA: SOMENTE ADMINISTRADOR
app.get('/api/usuarios', usuarioConectado, somenteAdmin, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT id, nome, email, papel, criado_em, ultimo_acesso
             FROM usuarios
             ORDER BY id DESC`
        );

        return res.json({ usuarios: resultado.rows });
    } catch (erro) {
        console.error('Erro ao listar usuários:', erro.message);
        return res.status(500).json({
            mensagem: 'Erro interno ao listar usuários.'
        });
    }
});

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

// INICIALIZAÇÃO DO BANCO E DO SERVIDOR
async function iniciarServidor() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(80) NOT NULL,
                email VARCHAR(254) NOT NULL UNIQUE,
                senha TEXT NOT NULL,
                papel VARCHAR(20) NOT NULL DEFAULT 'usuario',
                criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ultimo_acesso TIMESTAMP
            )
        `);

        await pool.query(`
            ALTER TABLE usuarios
            ADD COLUMN IF NOT EXISTS papel VARCHAR(20) NOT NULL DEFAULT 'usuario'
        `);

        await pool.query(`
            ALTER TABLE usuarios
            ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        `);

        await pool.query(`
            ALTER TABLE usuarios
            ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMP
        `);

        if (emailAdmin) {
            await pool.query(
                `UPDATE usuarios SET papel = 'admin' WHERE email = $1`,
                [emailAdmin]
            );
        }

        app.listen(porta, () => {
            console.log(`Servidor iniciado na porta ${porta}`);
            console.log(
                emailAdmin
                    ? `Administrador configurado: ${emailAdmin}`
                    : 'ADMIN_EMAIL não configurado.'
            );
        });
    } catch (erro) {
    console.error('Erro ao iniciar o servidor:', erro);
    process.exit(1);
}
}

iniciarServidor();
