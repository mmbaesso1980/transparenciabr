#!/bin/bash

# Ativador da estratégia de ultratrade MEX x ING para o projeto WOLF

# IDs dos tokens a serem substituídos
TOKEN_ID_MEX_OLD="<ID_MEX_A_SUBSTITUIR>"
TOKEN_ID_ING_OLD="<ID_ING_A_SUBSTITUIR>"

TOKEN_ID_MEX_NEW="TOKEN_MEX_WOLF_2026_V1"
TOKEN_ID_ING_NEW="TOKEN_ING_WOLF_2026_V1"

# Script Python alvo
PYTHON_SCRIPT="/opt/wolf/repo/estategia_mex_ing.py"

# 1. Substituir dinamicamente os IDs dos tokens no script Python
echo "1. Substituindo IDs dos tokens em $PYTHON_SCRIPT..."
sed -i "s/$TOKEN_ID_MEX_OLD/$TOKEN_ID_MEX_NEW/g" $PYTHON_SCRIPT
sed -i "s/$TOKEN_ID_ING_OLD/$TOKEN_ID_ING_NEW/g" $PYTHON_SCRIPT

# 2. Compilar o script para validar a sintaxe (gera .pyc)
echo "2. Validando a sintaxe do script Python..."
python -m compileall $PYTHON_SCRIPT

# 3. Checar o resultado da compilação
if [ $? -eq 0 ]; then
  echo "Sintaxe validada com sucesso. O script está pronto para execução."
  # Aqui entraria o comando para executar o script em produção
  # Ex: python $PYTHON_SCRIPT
else
  echo "ERRO: Falha na validação de sintaxe. Abortando."
  exit 1
fi

echo "Ativação da estratégia MEX x ING concluída."
