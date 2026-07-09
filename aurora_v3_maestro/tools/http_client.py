# -*- coding: utf-8 -*-
"""
Ferramenta HTTP Genérica para o Maestro.
Permite a interação com qualquer API RESTful.
"""
import requests
import json

def http_request(method: str, url: str, headers: dict = None, params: dict = None, json_data: dict = None, timeout: int = 30) -> dict:
    """
    Realiza uma chamada HTTP genérica.

    Args:
        method (str): Método HTTP (GET, POST, PUT, DELETE, PATCH).
        url (str): A URL do endpoint.
        headers (dict, optional): Cabeçalhos da requisição. Defaults to None.
        params (dict, optional): Parâmetros da URL (query string). Defaults to None.
        json_data (dict, optional): Corpo da requisição em formato JSON para POST/PUT/PATCH. Defaults to None.
        timeout (int, optional): Timeout em segundos. Defaults to 30.

    Returns:
        dict: Um dicionário contendo 'status_code', 'headers' e 'body' (em JSON, se possível, senão texto).
              Em caso de erro, retorna 'error' com a descrição.
    """
    try:
        response = requests.request(
            method=method.upper(),
            url=url,
            headers=headers,
            params=params,
            json=json_data,
            timeout=timeout
        )
        response.raise_for_status()  # Lança exceção para status de erro (4xx ou 5xx)

        try:
            body = response.json()
        except json.JSONDecodeError:
            body = response.text

        return {
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "body": body
        }

    except requests.exceptions.RequestException as e:
        return {
            "error": f"Erro na requisição: {type(e).__name__}",
            "message": str(e)
        }
    except Exception as e:
        return {
            "error": f"Erro inesperado: {type(e).__name__}",
            "message": str(e)
        }
