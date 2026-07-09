
### Proposta de Adição ao System Prompt

**Adicionar a seguinte definição de ferramenta ao `TOOL_LIBRARY`:**

```python
def http_request(
    method: Literal['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    url: str,
    headers: dict | None = None,
    params: dict | None = None,
    json_data: dict | None = None,
    timeout: int | None = 30,
) -> dict:
  """Realiza uma chamada HTTP genérica para interagir com APIs RESTful.

  Args:
    method: O método HTTP a ser utilizado.
    url: A URL completa do endpoint.
    headers: Dicionário de cabeçalhos da requisição.
    params: Dicionário de parâmetros de URL (query string).
    json_data: Corpo da requisição em formato JSON para POST/PUT/PATCH.
    timeout: Timeout em segundos.
  """
```

**Justificativa:** Esta ferramenta é o próximo passo evolutivo para a autonomia, permitindo a interação com qualquer API web, conforme lição aprendida e registrada em memória.
