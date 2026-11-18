#!/usr/bin/env python3
"""Validador INDEPENDENTE: abre o xlsx com openpyxl e imprime JSON {aba: [[valores]]}.
Uso: python3 xlsx-externo.py <arquivo.xlsx>. Falha (exit != 0) se o openpyxl não abrir."""
import json
import sys
from openpyxl import load_workbook

wb = load_workbook(sys.argv[1], data_only=True)
saida = {ws.title: [[c.value for c in linha] for linha in ws.iter_rows()] for ws in wb.worksheets}
print(json.dumps(saida, ensure_ascii=False))
