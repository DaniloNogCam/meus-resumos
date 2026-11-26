/* =========================================================
   script.js — Lógica do site de resumos
   Este arquivo é usado por TODAS as páginas.

   COMO OS PDFs SÃO SALVOS?
   O GitHub Pages só entrega arquivos prontos (é um site
   "estático"): ele não tem um servidor próprio para guardar
   uploads. Então usamos a API do GitHub: o site envia o PDF
   direto para a pasta "resumos/" do repositório, como se você
   tivesse feito o upload pelo github.com.

   - Para ENVIAR ou EXCLUIR é preciso um token (uma "senha"
     só para o site). Ele fica guardado no seu navegador
     (localStorage) e NUNCA no código, pois o repositório é público.
   - Para LISTAR e ABRIR não precisa de token: os arquivos são públicos.
   ========================================================= */

/* ---------------------------------------------------------
   1. CONFIGURAÇÃO
   Se mudar o nome do repositório, altere aqui.
   --------------------------------------------------------- */
const USUARIO_GITHUB = "DaniloNogCam";
const REPOSITORIO = "meus-resumos";
const PASTA_RESUMOS = "resumos"; // pasta do repositório onde os PDFs ficam

// Endereço base da API para a pasta de resumos
const URL_API =
  "https://api.github.com/repos/" + USUARIO_GITHUB + "/" + REPOSITORIO +
  "/contents/" + PASTA_RESUMOS;

// Nome usado para guardar o token no localStorage do navegador
const CHAVE_TOKEN = "github-token";

/* ---------------------------------------------------------
   2. TOKEN DE ACESSO
   localStorage guarda textos no navegador, e eles continuam
   lá mesmo depois de fechar o site.
   --------------------------------------------------------- */

/** Devolve o token salvo. Se não houver, pede para o usuário digitar. */
function obterToken() {
  let token = localStorage.getItem(CHAVE_TOKEN);

  if (!token) {
    // prompt() mostra uma caixinha para digitar um texto
    token = prompt(
      "Cole aqui o seu token do GitHub (começa com github_pat_).\n" +
      "Ele fica salvo só neste navegador."
    );
    if (!token) return null;           // usuário cancelou
    token = token.trim();              // tira espaços extras
    localStorage.setItem(CHAVE_TOKEN, token);
  }

  return token;
}

/** Apaga o token salvo (usado quando ele está errado ou expirou). */
function esquecerToken() {
  localStorage.removeItem(CHAVE_TOKEN);
}

/* ---------------------------------------------------------
   3. CONVERSA COM A API DO GITHUB
   --------------------------------------------------------- */

/**
 * Faz uma requisição para a API do GitHub.
 * caminho: parte do endereço depois de URL_API (ex.: "/calculo.pdf")
 * opcoes:  método (GET, PUT, DELETE), corpo, e se precisa de token.
 */
async function chamarApi(caminho, { metodo = "GET", corpo = null, comToken = false } = {}) {
  const cabecalhos = { Accept: "application/vnd.github+json" };

  // Se pedimos token, ou se ele já estiver salvo, enviamos.
  // (Com token o GitHub deixa fazer mais requisições por hora.)
  const token = comToken ? obterToken() : localStorage.getItem(CHAVE_TOKEN);
  if (comToken && !token) throw new Error("SEM_TOKEN");
  if (token) cabecalhos.Authorization = "Bearer " + token;

  const resposta = await fetch(URL_API + caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo ? JSON.stringify(corpo) : null,
    cache: "no-store", // sempre buscar a versão mais nova da lista
  });

  // 401 = token inválido ou expirado: apagamos para pedir de novo depois
  if (resposta.status === 401) {
    esquecerToken();
    throw new Error("TOKEN_INVALIDO");
  }

  return resposta;
}

/**
 * Converte um arquivo para Base64 (texto), que é o formato que
 * a API do GitHub exige para enviar arquivos.
 */
function arquivoParaBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    // O resultado vem como "data:application/pdf;base64,AAAA..."
    // e só queremos a parte depois da vírgula.
    leitor.onload = () => resolve(leitor.result.split(",")[1]);
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

/** Monta o caminho de um arquivo na API. encodeURIComponent trata espaços e acentos. */
function caminhoDoArquivo(nome) {
  return "/" + encodeURIComponent(nome);
}

/** Envia um PDF para o repositório (cria um commit). */
async function enviarResumo(arquivo) {
  const conteudo = await arquivoParaBase64(arquivo);

  const resposta = await chamarApi(caminhoDoArquivo(arquivo.name), {
    metodo: "PUT",
    comToken: true,
    corpo: {
      message: "Adiciona resumo " + arquivo.name, // mensagem do commit
      content: conteudo,
    },
  });

  // 422 aqui significa que já existe um arquivo com esse nome
  if (resposta.status === 422) throw new Error("JA_EXISTE");
  if (!resposta.ok) throw new Error("ERRO_" + resposta.status);
}

/** Lista os PDFs da pasta "resumos/" do repositório. */
async function listarResumos() {
  const resposta = await chamarApi("");

  // 404 = a pasta ainda não existe (nenhum resumo enviado)
  if (resposta.status === 404) return [];
  if (!resposta.ok) throw new Error("ERRO_" + resposta.status);

  const itens = await resposta.json();
  // Fica só com arquivos terminados em .pdf
  return itens.filter((item) => item.type === "file" && item.name.toLowerCase().endsWith(".pdf"));
}

/** Exclui um PDF do repositório. O GitHub exige o "sha" (identificador da versão do arquivo). */
async function excluirResumo(nome, sha) {
  const resposta = await chamarApi(caminhoDoArquivo(nome), {
    metodo: "DELETE",
    comToken: true,
    corpo: { message: "Remove resumo " + nome, sha: sha },
  });
  if (!resposta.ok) throw new Error("ERRO_" + resposta.status);
}

/* ---------------------------------------------------------
   4. MENSAGENS DE ERRO E AVISOS
   --------------------------------------------------------- */

/** Traduz os erros acima em mensagens fáceis de entender. */
function mensagemDeErro(erro, nomeArquivo) {
  switch (erro.message) {
    case "SEM_TOKEN":
      return "Envio cancelado: é preciso informar o token do GitHub.";
    case "TOKEN_INVALIDO":
      return "O token do GitHub está errado ou expirou. Tente de novo e cole um token válido.";
    case "JA_EXISTE":
      return 'Já existe um resumo chamado "' + nomeArquivo + '". Renomeie o arquivo e tente de novo.';
    default:
      console.error(erro);
      return "Algo deu errado (" + erro.message + "). Veja detalhes no console (F12).";
  }
}

/** Mostra um aviso no canto da tela (ex.: "Enviando..."). Passe "" para esconder. */
function mostrarAviso(texto) {
  let aviso = document.getElementById("aviso");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "aviso";
    aviso.className = "aviso";
    document.body.appendChild(aviso);
  }
  aviso.textContent = texto;
  aviso.hidden = texto === "";
}

/** Converte bytes em KB ou MB. Ex.: 1536000 -> "1.5 MB" */
function formatarTamanho(bytes) {
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(0) + " KB";
  }
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/* ---------------------------------------------------------
   5. ESCOLHER O PDF (explorador de arquivos)
   Existe um <input type="file"> escondido em cada página.
   Clicar em qualquer elemento com a classe "abrir-seletor"
   "clica" nesse input, e o navegador abre o explorador.
   --------------------------------------------------------- */
function configurarSeletorDePdf() {
  const seletor = document.getElementById("seletor-pdf");
  if (!seletor) return;

  document.querySelectorAll(".abrir-seletor").forEach((botao) => {
    botao.addEventListener("click", (evento) => {
      evento.preventDefault(); // impede o link de trocar de página
      seletor.click();         // abre o explorador de arquivos
    });
  });

  // "change" acontece quando o usuário escolhe o(s) arquivo(s)
  seletor.addEventListener("change", async () => {
    const pdfs = Array.from(seletor.files).filter((a) => a.type === "application/pdf");
    seletor.value = ""; // limpa para poder escolher o mesmo arquivo de novo

    if (pdfs.length === 0) {
      alert("Escolha um arquivo em PDF.");
      return;
    }

    let enviados = 0;
    for (const pdf of pdfs) {
      mostrarAviso("Enviando " + pdf.name + "...");
      try {
        await enviarResumo(pdf);
        enviados++;
      } catch (erro) {
        mostrarAviso("");
        alert(mensagemDeErro(erro, pdf.name));
        // Sem token ou token inválido: não adianta tentar os outros
        if (erro.message === "SEM_TOKEN" || erro.message === "TOKEN_INVALIDO") break;
      }
    }
    mostrarAviso("");

    // Se pelo menos um foi enviado, vai para a lista
    if (enviados > 0) {
      window.location.href = "todos-resumos.html";
    }
  });
}

/* ---------------------------------------------------------
   6. PÁGINA "TODOS OS RESUMOS"
   --------------------------------------------------------- */
async function mostrarListaDeResumos() {
  const lista = document.getElementById("lista-resumos");
  if (!lista) return; // não estamos na página da lista

  let resumos;
  try {
    resumos = await listarResumos();
  } catch (erro) {
    lista.innerHTML = "";
    const p = document.createElement("p");
    p.className = "texto-suave";
    p.textContent = "Não foi possível carregar os resumos. " + mensagemDeErro(erro);
    lista.appendChild(p);
    return;
  }

  if (resumos.length === 0) {
    lista.innerHTML = '<p class="texto-suave">Nenhum resumo adicionado ainda.</p>';
    return;
  }

  // Ordem alfabética (localeCompare respeita acentos)
  resumos.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  lista.innerHTML = "";

  resumos.forEach((resumo) => {
    const item = document.createElement("div");
    item.className = "item-resumo";

    // Informações. textContent (e não innerHTML) evita que um
    // nome de arquivo estranho seja interpretado como código HTML.
    const info = document.createElement("div");
    info.className = "item-info";

    const nome = document.createElement("h3");
    nome.textContent = "📄 " + resumo.name;

    const detalhes = document.createElement("p");
    detalhes.className = "texto-suave";
    detalhes.textContent = formatarTamanho(resumo.size);

    info.append(nome, detalhes);

    // Ações
    const acoes = document.createElement("div");
    acoes.className = "item-acoes";

    // "Abrir" é um link para o PDF publicado pelo GitHub Pages.
    // O endereço é relativo: resumos/nome.pdf, ao lado desta página.
    const botaoAbrir = document.createElement("a");
    botaoAbrir.className = "botao";
    botaoAbrir.textContent = "Abrir";
    botaoAbrir.href = PASTA_RESUMOS + "/" + encodeURIComponent(resumo.name);
    botaoAbrir.target = "_blank"; // nova aba

    const botaoExcluir = document.createElement("button");
    botaoExcluir.className = "botao botao-perigo";
    botaoExcluir.textContent = "Excluir";
    botaoExcluir.addEventListener("click", async () => {
      if (!confirm('Excluir "' + resumo.name + '" do repositório?')) return;
      mostrarAviso("Excluindo " + resumo.name + "...");
      try {
        await excluirResumo(resumo.name, resumo.sha);
        item.remove(); // tira da tela na hora
      } catch (erro) {
        alert(mensagemDeErro(erro, resumo.name));
      }
      mostrarAviso("");
    });

    acoes.append(botaoAbrir, botaoExcluir);
    item.append(info, acoes);
    lista.appendChild(item);
  });
}

/* ---------------------------------------------------------
   7. BOTÃO "TROCAR TOKEN" (página Adicionar resumo)
   --------------------------------------------------------- */
function configurarBotaoTrocarToken() {
  const botao = document.getElementById("trocar-token");
  if (!botao) return;

  botao.addEventListener("click", () => {
    esquecerToken();
    alert("Token apagado deste navegador. Ele será pedido no próximo envio.");
  });
}

/* ---------------------------------------------------------
   8. INÍCIO
   "DOMContentLoaded" dispara quando o HTML terminou de carregar.
   --------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  configurarSeletorDePdf();
  configurarBotaoTrocarToken();
  mostrarListaDeResumos();
});
