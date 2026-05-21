# vertex_setup.py
# Wrapper centralizado de autenticação Vertex AI para TransparênciaBR
# Projeto GCP: projeto-codex-br (crédito GenAI App Builder até 07/04/2027)

import os
import vertexai
from google.oauth2 import service_account


def init_vertex(project_id="projeto-codex-br", location="us-east1"):
    """
    Inicializa Vertex AI com autenticação resiliente.
    Tenta Service Account primeiro, fallback para ADC (Application Default Credentials).
    """
    # Caminho para chave JSON (se existir)
    key_path = os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS",
        os.path.expanduser("~/keys/vertex-key.json")
    )

    if os.path.exists(key_path):
        # Autenticação via Service Account
        credentials = service_account.Credentials.from_service_account_file(key_path)
        vertexai.init(project=project_id, location=location, credentials=credentials)
        print(f"✅ Vertex AI inicializado com Service Account no projeto {project_id}")
    else:
        # Fallback para ADC (VM com service account, Cloud Shell, etc.)
        vertexai.init(project=project_id, location=location)
        print(f"✅ Vertex AI inicializado via ADC no projeto {project_id}")

    return True


def get_model(model_name="gemini-2.5-pro"):
    """
    Retorna instância do modelo Gemini configurado.
    Modelos disponíveis no projeto-codex-br:
    - gemini-2.5-pro (melhor qualidade, mais caro)
    - gemini-2.0-flash (rápido e barato, ideal para classificação em batch)
    - gemini-1.5-pro (legacy, ainda funciona)
    """
    from vertexai.generative_models import GenerativeModel
    return GenerativeModel(model_name)


# Teste rápido
if __name__ == "__main__":
    init_vertex()
    model = get_model("gemini-2.0-flash")
    response = model.generate_content("Diga 'TransparênciaBR online!' em uma linha.")
    print(f"Resposta: {response.text}")
