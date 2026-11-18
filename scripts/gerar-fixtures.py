#!/usr/bin/env python3
"""Gera as planilhas FICTÍCIAS de tests/fixtures/ com openpyxl. Nunca usar dados reais."""
import os
from openpyxl import Workbook

PASTA = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures")
CABECALHOS = ["Id Origem", "Nome", "CPF/CNPJ", "Motivo Mãe", "Telefones", "Lote", "Status", "Retorno"]
LINHAS = [
    [1, "Ana Maria Souza", "00000000001", "Cobrança", 71900000001, "L1", "Novo", None],
    [2, "Bruno Lima", "00000000002", "Cobrança", 71900000002, "L1", "Respondido", None],
    [3, "Carla Dias", "00000000003", "Suporte", 71900000003, "L2", "Fechado", None],
    [4, "Daniel Rocha", "00000000004", "Suporte", 71900000004, "L2", "#N/A", None],
]


def modelo():
    wb = Workbook()
    ws = wb.active
    ws.title = "AÇÃO"
    ws.append(CABECALHOS)
    for linha in LINHAS:
        ws.append(linha)
    wb.save(os.path.join(PASTA, "modelo.xlsx"))


if __name__ == "__main__":
    os.makedirs(PASTA, exist_ok=True)
    modelo()
    print("fixtures geradas em", os.path.abspath(PASTA))
