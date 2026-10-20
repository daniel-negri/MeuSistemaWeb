
const telaAutenticacao = document.getElementById('telaAutenticacao');
const telaCadastro = document.getElementById('telaCadastro');
const painel = document.getElementById('painel');

let usuarioAtual = null;
let usuariosCarregados = [];

// Faz requisições ao servidor e trata respostas JSON
async function requisicao(url, opcoes = {}) {
    const resposta = await fetch(url, {
        credentials: 'same-origin',
        ...opcoes,
        headers: {
            ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
            ...opcoes.headers
        }
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        throw new Error(
            dados.mensagem || 'Não foi possível concluir a operação.'
        );
    }

    return dados;
}

// Exibe mensagens na tela
function mostrarMensagem(elemento, texto, tipo = '') {
    if (!elemento) return;

    elemento.textContent = texto;
    elemento.className = 'mensagem';

    if (tipo) {
        elemento.classList.add(tipo);
    }
}

function mostrarLogin() {
    telaAutenticacao?.classList.remove('oculto');
    telaCadastro?.classList.add('oculto');
    painel?.classList.add('oculto');
}

function mostrarTelaCadastro() {
    telaAutenticacao?.classList.add('oculto');
    telaCadastro?.classList.remove('oculto');
    painel?.classList.add('oculto');
}

function inicial(texto) {
    return (texto || 'U').trim().charAt(0).toUpperCase();
}

// Formata as datas
function formatarData(data) {
    if (!data) {
        return 'Nunca registrado';
    }

    const resultado = String(data).match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (!resultado) {
        return data;
    }

    const [, ano, mes, dia, hora, minuto] = resultado;

    if (hora) {
        return `${dia}/${mes}/${ano} às ${hora}:${minuto}`;
    }

    return `${dia}/${mes}/${ano}`;
}

// Preenche os dados do usuário conectado
function atualizarDadosUsuario(usuario) {
    usuarioAtual = usuario;

    const primeiroNome = (usuario.nome || '').trim().split(/\s+/)[0];

    const preencher = (id, valor) => {
        const elemento = document.getElementById(id);

        if (elemento) {
            elemento.textContent = valor ?? '';
        }
    };

    preencher('nomeMenu', usuario.nome);
    preencher(
        'papelMenu',
        usuario.papel === 'admin' ? 'Administrador' : 'Usuário'
    );

    preencher('nomeTopo', usuario.nome);
    preencher('emailTopo', usuario.email);
    preencher('nomeBoasVindas', primeiroNome);
    preencher('resumoNome', usuario.nome);
    preencher(
        'resumoPapel',
        usuario.papel === 'admin' ? 'Administrador' : 'Usuário'
    );

    preencher('avatarMenu', inicial(usuario.nome));
    preencher('avatarTopo', inicial(usuario.nome));
    preencher('avatarPerfil', inicial(usuario.nome));

    preencher('perfilNome', usuario.nome);
    preencher('perfilNomeDetalhe', usuario.nome);
    preencher('perfilEmail', usuario.email);
    preencher('perfilId', usuario.id);
    preencher(
        'perfilPapel',
        usuario.papel === 'admin' ? 'Administrador' : 'Usuário'
    );

    preencher('perfilCriado', formatarData(usuario.criado_em));
    preencher('perfilAcesso', formatarData(usuario.ultimo_acesso));

    document.querySelectorAll('.admin-only').forEach(elemento => {
        elemento.classList.toggle('oculto', usuario.papel !== 'admin');
    });
}

function mostrarPainel(usuario) {
    atualizarDadosUsuario(usuario);

    telaAutenticacao?.classList.add('oculto');
    telaCadastro?.classList.add('oculto');
    painel?.classList.remove('oculto');

    abrirPagina('inicio');
}

// Alterna as páginas internas
function abrirPagina(nomePagina) {
    if (
        nomePagina === 'usuarios' &&
        (!usuarioAtual || usuarioAtual.papel !== 'admin')
    ) {
        abrirPagina('inicio');
        return;
    }

    document.querySelectorAll('.pagina').forEach(pagina => {
        pagina.classList.add('oculto');
    });

    const pagina = document.getElementById(`pagina-${nomePagina}`);

    if (!pagina) {
        return;
    }

    pagina.classList.remove('oculto');

    document.querySelectorAll('.menu-item').forEach(botao => {
        botao.classList.toggle(
            'ativo',
            botao.dataset.pagina === nomePagina
        );
    });

    const titulos = {
        inicio: 'Dashboard',
        perfil: 'Meu perfil',
        usuarios: 'Usuários cadastrados',
        configuracoes: 'Configurações'
    };

    const titulo = document.getElementById('tituloPagina');

    if (titulo) {
        titulo.textContent = titulos[nomePagina] || 'MeuSistema';
    }

    if (nomePagina === 'usuarios') {
        carregarUsuarios();
    }
}

// Alternar entre login e cadastro
document.getElementById('mostrarCadastro')?.addEventListener('click', () => {
    mostrarMensagem(document.getElementById('mensagemCadastro'), '');
    mostrarTelaCadastro();
});

document.getElementById('mostrarLogin')?.addEventListener('click', () => {
    mostrarMensagem(document.getElementById('mensagemLogin'), '');
    mostrarLogin();
});

// CADASTRO
const formCadastro = document.getElementById('formCadastro');

formCadastro?.addEventListener('submit', async evento => {
    evento.preventDefault();

    const formulario = evento.currentTarget;
    const mensagem = document.getElementById('mensagemCadastro');
    const botao = formulario.querySelector('button[type="submit"]');

    const nome = document.getElementById('cadastroNome').value.trim();
    const email = document.getElementById('cadastroEmail').value.trim();
    const senha = document.getElementById('cadastroSenha').value;

    if (botao) botao.disabled = true;

    mostrarMensagem(mensagem, 'Realizando cadastro...');

    try {
        const dados = await requisicao('/cadastro', {
            method: 'POST',
            body: JSON.stringify({ nome, email, senha })
        });

        // Limpa o formulário que iniciou o evento
        formulario.reset();

        mostrarMensagem(mensagem, dados.mensagem, 'sucesso');

        const loginEmail = document.getElementById('loginEmail');
        const loginSenha = document.getElementById('loginSenha');

        if (loginEmail) loginEmail.value = email;
        if (loginSenha) loginSenha.value = '';

        setTimeout(() => {
            mostrarLogin();
            mostrarMensagem(
                document.getElementById('mensagemLogin'),
                'Cadastro realizado! Entre com sua conta.',
                'sucesso'
            );
        }, 1000);

    } catch (erro) {
        mostrarMensagem(mensagem, erro.message, 'erro');
    } finally {
        if (botao) botao.disabled = false;
    }
});

// LOGIN
const formLogin = document.getElementById('formLogin');

formLogin?.addEventListener('submit', async evento => {
    evento.preventDefault();

    const formulario = evento.currentTarget;
    const mensagem = document.getElementById('mensagemLogin');
    const botao = formulario.querySelector('button[type="submit"]');

    const email = document.getElementById('loginEmail').value.trim();
    const senha = document.getElementById('loginSenha').value;

    if (botao) botao.disabled = true;

    mostrarMensagem(mensagem, 'Verificando seus dados...');

    try {
        await requisicao('/login', {
            method: 'POST',
            body: JSON.stringify({ email, senha })
        });

        // Limpa o formulário de login
        formulario.reset();

        const dados = await requisicao('/sessao');

        mostrarPainel(dados.usuario);

    } catch (erro) {
        mostrarMensagem(mensagem, erro.message, 'erro');
    } finally {
        if (botao) botao.disabled = false;
    }
});

// MENU DE NAVEGAÇÃO
document.querySelectorAll('.menu-item').forEach(botao => {
    botao.addEventListener('click', () => {
        abrirPagina(botao.dataset.pagina);
    });
});

document.querySelectorAll('[data-ir]').forEach(botao => {
    botao.addEventListener('click', () => {
        abrirPagina(botao.dataset.ir);
    });
});

// Cria células da tabela com segurança
function criarCelula(texto, classe = '') {
    const celula = document.createElement('td');
    celula.textContent = texto ?? '—';

    if (classe) {
        celula.className = classe;
    }

    return celula;
}

function desenharUsuarios() {
    const tabela = document.getElementById('listaUsuarios');
    const campoFiltro = document.getElementById('filtroUsuarios');

    if (!tabela || !campoFiltro) return;

    const filtro = campoFiltro.value.trim().toLowerCase();

    tabela.replaceChildren();

    const encontrados = usuariosCarregados.filter(usuario => {
        return (usuario.nome || '').toLowerCase().includes(filtro) ||
            (usuario.email || '').toLowerCase().includes(filtro);
    });

    if (encontrados.length === 0) {
        const linha = document.createElement('tr');
        const celula = criarCelula('Nenhum usuário encontrado.');

        celula.colSpan = 6;
        celula.className = 'vazio';

        linha.appendChild(celula);
        tabela.appendChild(linha);
        return;
    }

    encontrados.forEach(usuario => {
        const linha = document.createElement('tr');

        linha.appendChild(criarCelula(usuario.id));
        linha.appendChild(criarCelula(usuario.nome));
        linha.appendChild(criarCelula(usuario.email, 'email-coluna'));

        const celulaPapel = document.createElement('td');
        const etiqueta = document.createElement('span');

        etiqueta.className = usuario.papel === 'admin'
            ? 'permissao admin'
            : 'permissao';

        etiqueta.textContent = usuario.papel === 'admin'
            ? 'Administrador'
            : 'Usuário';

        celulaPapel.appendChild(etiqueta);
        linha.appendChild(celulaPapel);

        linha.appendChild(criarCelula(formatarData(usuario.criado_em)));
        linha.appendChild(criarCelula(formatarData(usuario.ultimo_acesso)));

        tabela.appendChild(linha);
    });
}

// Carrega os usuários pelo servidor
async function carregarUsuarios() {
    const mensagem = document.getElementById('mensagemUsuarios');
    const tabela = document.getElementById('listaUsuarios');

    if (!tabela) return;

    mostrarMensagem(mensagem, 'Carregando usuários...');
    tabela.replaceChildren();

    try {
        const dados = await requisicao('/api/usuarios');

        usuariosCarregados = dados.usuarios || [];

        const totalUsuarios = document.getElementById('totalUsuarios');
        const totalAdmins = document.getElementById('totalAdmins');

        if (totalUsuarios) {
            totalUsuarios.textContent = usuariosCarregados.length;
        }

        if (totalAdmins) {
            totalAdmins.textContent = usuariosCarregados.filter(
                usuario => usuario.papel === 'admin'
            ).length;
        }

        desenharUsuarios();
        mostrarMensagem(mensagem, '');

    } catch (erro) {
        usuariosCarregados = [];

        mostrarMensagem(mensagem, erro.message, 'erro');

        const linha = document.createElement('tr');
        const celula = criarCelula(erro.message);

        celula.colSpan = 6;
        celula.className = 'vazio';

        linha.appendChild(celula);
        tabela.appendChild(linha);
    }
}

document.getElementById('btnAtualizarUsuarios')?.addEventListener(
    'click',
    carregarUsuarios
);

document.getElementById('filtroUsuarios')?.addEventListener(
    'input',
    desenharUsuarios
);

// SAIR
async function sairDaConta() {
    try {
        await requisicao('/logout', { method: 'POST' });
    } catch (erro) {
        console.error('Erro ao sair:', erro.message);
    } finally {
        usuarioAtual = null;
        usuariosCarregados = [];
        mostrarLogin();
    }
}

document.getElementById('btnSair')?.addEventListener('click', sairDaConta);

document.getElementById('btnSairConfiguracoes')?.addEventListener(
    'click',
    sairDaConta
);

// MODO ESCURO
const alternarTema = document.getElementById('alternarTema');

alternarTema?.addEventListener('change', () => {
    document.body.classList.toggle('tema-escuro', alternarTema.checked);
});

// Verifica se já existe uma sessão ativa
async function verificarSessao() {
    try {
        const dados = await requisicao('/sessao');
        mostrarPainel(dados.usuario);
    } catch {
        mostrarLogin();
    }
}

verificarSessao();
