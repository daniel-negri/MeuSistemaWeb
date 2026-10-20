
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const readline = require('readline/promises');

const db = new Database(path.join(__dirname, 'banco.db'));

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function redefinirSenha() {
    try {
        const email = (
            await rl.question('Digite o e-mail da sua conta: ')
        ).trim().toLowerCase();

        const usuario = db.prepare(
            'SELECT id, nome, email FROM usuarios WHERE email = ?'
        ).get(email);

        if (!usuario) {
            console.log('Nenhuma conta encontrada com esse e-mail.');
            return;
        }

        const senha = await rl.question(
            'Digite sua nova senha (mínimo 8 caracteres): '
        );

        if (
            senha.length < 8 ||
            Buffer.byteLength(senha, 'utf8') > 72
        ) {
            console.log('A senha deve ter de 8 a 72 bytes.');
            return;
        }

        const confirmar = await rl.question(
            'Digite novamente a nova senha: '
        );

        if (senha !== confirmar) {
            console.log('As senhas não são iguais.');
            return;
        }

        const hash = await bcrypt.hash(senha, 12);

        db.prepare(
            'UPDATE usuarios SET senha = ? WHERE id = ?'
        ).run(hash, usuario.id);

        console.log(`Senha redefinida para a conta: ${usuario.email}`);
        console.log('Agora você pode entrar no site com a nova senha.');

    } catch (erro) {
        console.log('Erro:', erro.message);
    } finally {
        rl.close();
        db.close();
    }
}

redefinirSenha();
