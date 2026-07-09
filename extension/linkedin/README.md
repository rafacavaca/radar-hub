# Enviar pro Radar — extensão LinkedIn (captura assistida)

Manda um post do LinkedIn pro Radar Hub com **um clique**, sem crawler e sem arriscar sua conta: você navega logado (humano) e clica **◎ Radar** no post.

## Instalar (uma vez)

1. **Baixe e descompacte** a pasta (o link vem do Radar).
2. Chrome → `chrome://extensions` → ligue **Modo desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → aponte para a pasta `radar-linkedin-extension`.
4. Pronto. Abra o LinkedIn — cada post ganha um botão **◎ Radar** no canto.

> Já vem pronta — você **não edita arquivo**. Na **primeira vez** que enviar um post, a extensão pede o **segredo do Radar** e guarda no navegador (não fica em arquivo).

## Usar

1. No post que interessa (concorrente ou conta-chave), clique **◎ Radar**.
2. O mini-popup abre já preenchido (perfil/papel/workspace vêm do pré-registro em `config.js`). Confira/edite.
3. **Enviar** (na 1ª vez, cole o segredo do Radar). O post cai no pilar certo:
   - **concorrente** → pilar Concorrentes (alimenta a *urgência* da correlação);
   - **conta-chave** → **ficha** daquela conta e dispara o analista de relacionamento.

## Bom saber

- A **data relativa** ("2 sem", "1 mês") é resolvida para data **absoluta** no Radar. Sem data confiável → "sem data de publicação" (nunca uma data errada).
- Todo post carrega a **URL de origem** (fonte).
- A extração é **best-effort** — se o texto/perfil vier torto, corrija no popup antes de enviar.
- É **captura assistida**: só entra o que você mandar. Comece com **3–4 perfis** (mix de concorrentes + contas-chave).

## Editar os perfis pré-registrados

Abra `config.js` e ajuste a lista `profiles` (cada item: `match` = trecho da URL/nome do perfil, `perfil`, `papel`, `workspace`). Recarregue a extensão em `chrome://extensions`.
