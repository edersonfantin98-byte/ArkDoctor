# ArkDoctor

## Como trabalhar comigo

### Pense Antes de Codificar

Não presuma. Não esconda a confusão. Traga à tona as compensações (tradeoffs).

Antes de implementar:

- Declare suas suposições explicitamente. Se estiver incerto, pergunte.
- Se existirem múltiplas interpretações, apresente-as — não escolha silenciosamente.
- Se existir uma abordagem mais simples, diga. Questione quando for justificável.
- Se algo não estiver claro, pare. Nomeie o que está confuso. Pergunte.

### Simplicidade em Primeiro Lugar

O mínimo de código que resolve o problema. Nada especulativo.

- Nenhum recurso além do que foi pedido.
- Nenhuma abstração para código de uso único.
- Nenhuma "flexibilidade" ou "configurabilidade" que não tenha sido solicitada.
- Nenhum tratamento de erro para cenários impossíveis.
- Se você escreveu 200 linhas e poderiam ser 50, reescreva.
- Pergunte-se: "Um engenheiro sênior diria que isso está excessivamente complicado?" Se sim, simplifique.

### Mudanças Cirúrgicas

Toque apenas no que for necessário. Limpe apenas a sua própria bagunça.

Ao editar código existente:

- Não "melhore" código, comentários ou formatação adjacentes.
- Não faça refatoração em coisas que não estão quebradas.
- Siga o estilo existente, mesmo que você fizesse de forma diferente.
- Se notar código morto não relacionado, mencione-o — não o delete.

Quando suas alterações criarem órfãos:

- Remova imports/variáveis/funções que as SUAS alterações tornaram não utilizados.
- Não remova código morto preexistente, a menos que seja solicitado.
- O teste: cada linha alterada deve rastrear diretamente para o pedido do usuário.

### Execução Orientada a Objetivos

Defina os critérios de sucesso. Repita em ciclo até verificar.

Transforme tarefas em objetivos verificáveis:

- "Adicionar validação" → "Escrever testes para entradas inválidas, depois fazê-los passar"
- "Corrigir o bug" → "Escrever um teste que o reproduza, depois fazê-lo passar"
- "Refatorar X" → "Garantir que os testes passem antes e depois"

Para tarefas de várias etapas, apresente um plano breve:

- [Etapa] → verificar: [checagem]
- [Etapa] → verificar: [checagem]
- [Etapa] → verificar: [checagem]

Critérios de sucesso sólidos permitem trabalhar em ciclo de forma independente. Critérios fracos ("faça funcionar") exigem esclarecimentos constantes.

Essas diretrizes estão funcionando se houver: menos alterações desnecessárias nos diffs, menos reescritas por supercomplicação, e perguntas de esclarecimento vindo antes da implementação — não depois dos erros.

## Índice — carregue sob demanda

Não necessário em toda sessão; abrir apenas quando a tarefa exigir.

- `docs/prd/arkdoctor-prd.md` — PRD completo: problema, solução, user stories, decisões de implementação/teste, fora de escopo.
- `docs/superpowers/specs/2026-08-20-arkdoctor-design.md` — design doc técnico: stack, modelo de dados, módulos, casos de borda.
