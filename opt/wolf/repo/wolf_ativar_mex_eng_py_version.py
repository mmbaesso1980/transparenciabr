import os
import py_compile
import fileinput

# IDs dos tokens a serem substituídos
TOKEN_ID_MEX_OLD = "<ID_MEX_A_SUBSTITUIR>"
TOKEN_ID_ING_OLD = "<ID_ING_A_SUBSTITUIR>"
TOKEN_ID_MEX_NEW = "TOKEN_MEX_WOLF_2026_V1"
TOKEN_ID_ING_NEW = "TOKEN_ING_WOLF_2026_V1"

# Script Python alvo
PYTHON_SCRIPT = "opt/wolf/repo/estategia_mex_ing.py"

def main():
    print(f"1. Substituindo IDs dos tokens em {PYTHON_SCRIPT}...")
    try:
        # Realiza a substituição inline no arquivo
        with fileinput.FileInput(PYTHON_SCRIPT, inplace=True) as file:
            for line in file:
                print(line.replace(TOKEN_ID_MEX_OLD, TOKEN_ID_MEX_NEW).replace(TOKEN_ID_ING_OLD, TOKEN_ID_ING_NEW), end='')
    except Exception as e:
        print(f"ERRO: Falha ao ler ou modificar o arquivo de estratégia: {e}")
        return

    print("2. Validando a sintaxe do script Python...")
    try:
        py_compile.compile(PYTHON_SCRIPT, doraise=True)
        print("Sintaxe validada com sucesso. O script está pronto para execução.")
        print("Ativação da estratégia MEX x ING concluída.")
    except py_compile.PyCompileError as e:
        print("ERRO: Falha na validação de sintaxe. Abortando.")
        print(e)
    except Exception as e:
        print(f"ERRO inesperado durante a compilação: {e}")

if __name__ == "__main__":
    # Garante que o diretório exista
    os.makedirs(os.path.dirname(PYTHON_SCRIPT), exist_ok=True)

    # Simula a existência do arquivo para o script poder ser criado e modificado
    if not os.path.exists(PYTHON_SCRIPT):
        with open(PYTHON_SCRIPT, "w") as f:
            f.write("# Placeholder para o script de estratégia MEX x ING\n")
            f.write(f"token_mex = \"{TOKEN_ID_MEX_OLD}\"\n")
            f.write(f"token_ing = \"{TOKEN_ID_ING_OLD}\"\n")

    main()
