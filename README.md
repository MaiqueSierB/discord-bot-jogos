# Bot de Avaliação de Filmes (RMDB)

Um bot para Discord, construído com Node.js e discord.js, que permite aos membros do servidor procurar informações sobre filmes, criar enquetes de avaliação interativas e manter um histórico das notas dadas pela comunidade.


## ✨ Funcionalidades

-   **Busca de Filmes Interativa:** Use o comando `/filme` para procurar por um filme. O bot apresenta os 5 resultados mais relevantes e permite que você escolha o correto através de botões.
-   **Enquetes Manuais:** As votações permanecem abertas por tempo indeterminado, permitindo que os membros votem quando quiserem.
-   **Votação Precisa por Formulário:** Em vez de reações, os membros clicam num botão "Dar a Minha Nota" e inserem uma nota decimal (ex: 7.3, 8.5) através de um formulário pop-up (Modal).
-   **Controlo de Voto Único:** Cada membro pode votar apenas uma vez por filme. Se um membro alterar a sua nota, o voto anterior é substituído.
-   **Cálculo e Registo de Média:** O comando `/fecharvotacao` encerra a enquete, calcula a nota média com base nos votos recebidos, exibe a lista de quem votou e guarda o resultado final numa base de dados.
-   **Histórico de Avaliações:** O comando `/filmesavaliados` mostra uma lista de todos os filmes que já foram avaliados pelo servidor, ordenados do mais recente para o mais antigo.
-   **Gestão da Lista:** O comando `/removefilme` permite remover um filme do histórico de avaliações.

## 🔧 Pré-requisitos

Antes de começar, certifique-se de que tem o seguinte instalado:
* [Node.js](https://nodejs.org/en/) (versão 18 ou superior)
* npm (geralmente vem instalado com o Node.js)

## ⚙️ Instalação e Configuração

Siga estes passos para colocar o bot a funcionar no seu próprio servidor.

**1. Clone o Repositório**
   ```bash
   git clone [https://github.com/seu-usuario/seu-repositorio.git](https://github.com/seu-usuario/seu-repositorio.git)
   cd seu-repositorio