#!/usr/bin/env python3
"""Gera as planilhas FICTÍCIAS de tests/fixtures/ com openpyxl (+ edição do XML cru para as manias do Excel).
Nunca usar dados reais."""
import os
import re
import zipfile
from openpyxl import Workbook
from openpyxl.styles import PatternFill

PASTA = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures")
CAB = ["Id Origem", "Nome", "CPF/CNPJ", "Motivo Mãe", "Telefones", "Lote", "Status", "Retorno"]
LINHAS = [
    [1, "Ana Maria Souza", "00000000001", "Cobrança", 71900000001, "L1", "Novo", None],
    [2, "Bruno Lima", "00000000002", "Cobrança", 71900000002, "L1", "Respondido", None],
    [3, "Carla Dias", "00000000003", "Suporte", 71900000003, "L2", "Fechado", None],
    [4, "Daniel Rocha", "00000000004", "Suporte", 71900000004, "L2", "#N/A", None],
]
CINZA = PatternFill("solid", fgColor="DDDDDD")


def caminho(nome):
    return os.path.join(PASTA, nome)


def novo(titulo="AÇÃO"):
    wb = Workbook()
    ws = wb.active
    ws.title = titulo
    return wb, ws


def modelo():
    wb, ws = novo()
    ws.append(CAB)
    for l in LINHAS:
        ws.append(l)
    ws["H5"].fill = CINZA  # célula vazia estilizada: openpyxl grava <c r="H5" s="N"/>
    wb.save(caminho("modelo.xlsx"))
    editar_zip(caminho("modelo.xlsx"), {"xl/worksheets/sheet1.xml": vazias_como_excel})


def sem_retorno():
    wb, ws = novo()
    ws.append(CAB[:6])
    for l in LINHAS:
        ws.append(l[:6])
    wb.save(caminho("sem-retorno.xlsx"))


def aba_segunda():
    wb, ws = novo("Resumo")
    ws.append(["Resumo"])
    ws.append(["isto não é a aba de dados"])
    ws2 = wb.create_sheet("AÇÃO")
    ws2.append(CAB)
    for l in LINHAS:
        ws2.append(l)
    wb.save(caminho("aba-segunda.xlsx"))


def esparsas():
    wb, ws = novo()
    ws.append(CAB)
    ws.append([1, "Ana Maria Souza", None, "Cobrança", 71900000001, "L1", "Novo", None])
    ws.append([2, "Bruno Lima", "00000000002", None, "71900000002 / 71900000003", "L1", None, None])  # 2 números, texto
    ws.append([3, None, None, None, "71900000004", "L2", None, None])                                 # só telefone (texto)
    ws.append([4, "Daniel & Filhos <ME>", None, None, None, "L2", "Fechado", None])                    # só nome, com & e <
    ws.append([5, "Eva Nunes", None, None, 71900000005, None, None, "Lida"])                           # Retorno já preenchido
    wb.save(caminho("celulas-esparsas.xlsx"))
    # manias do Excel no XML cru: notação científica no <v> e uma string via sharedStrings (t="s")
    def aba(xml):
        xml = xml.replace("<v>71900000001</v>", "<v>7.1900000001E10</v>")
        xml, n = re.subn(r'<c r="B3" t="inlineStr"><is><t>Bruno Lima</t></is></c>', '<c r="B3" t="s"><v>0</v></c>', xml)
        assert "7.1900000001E10" in xml and n == 1, "edição do XML da aba falhou"
        return xml
    def compartilhadas(xml):
        return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="1" uniqueCount="1">'
                '<si><t>Bruno Lima</t></si></sst>')
    def tipos(xml):
        return xml.replace("</Types>", '<Override PartName="/xl/sharedStrings.xml" ContentType='
                           '"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
    def rels(xml):
        return xml.replace("</Relationships>", '<Relationship Id="rIdSS" Type="http://schemas.openxmlformats.org/'
                           'officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
    editar_zip(caminho("celulas-esparsas.xlsx"),
               {"xl/worksheets/sheet1.xml": lambda x: vazias_como_excel(aba(x)),
                "[Content_Types].xml": tipos, "xl/_rels/workbook.xml.rels": rels},
               novas={"xl/sharedStrings.xml": compartilhadas('')})


def vazias_estilizadas():
    wb, ws = novo()
    ws.append(CAB)
    for l in LINHAS[:2]:
        ws.append(l)
    for linha in range(4, 7):  # linhas sem dado, só formatadas (acontece muito em planilhas reais)
        for col in range(1, 9):
            ws.cell(row=linha, column=col).fill = CINZA
    wb.save(caminho("linhas-vazias-estilizadas.xlsx"))
    editar_zip(caminho("linhas-vazias-estilizadas.xlsx"), {"xl/worksheets/sheet1.xml": vazias_como_excel})


def vazias_como_excel(xml):
    """openpyxl grava célula vazia estilizada como <c r s t="n"></c>; o Excel grava <c r s/>."""
    return re.sub(r'<c r="([A-Z]+\d+)" s="(\d+)" t="n"></c>', r'<c r="\1" s="\2"/>', xml)


def editar_zip(arquivo, edicoes, novas=None):
    """edicoes: {caminho interno: função(texto) -> texto}. Escreve em temporário e só então troca o arquivo."""
    with zipfile.ZipFile(arquivo) as z:
        itens = [(i, z.read(i.filename)) for i in z.infolist()]
    tmp = arquivo + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for info, dados in itens:
            if info.filename in edicoes:
                dados = edicoes[info.filename](dados.decode("utf-8")).encode("utf-8")
            z.writestr(info.filename, dados)
        for nome, texto in (novas or {}).items():
            z.writestr(nome, texto.encode("utf-8"))
    os.replace(tmp, arquivo)


if __name__ == "__main__":
    os.makedirs(PASTA, exist_ok=True)
    for f in (modelo, sem_retorno, aba_segunda, esparsas, vazias_estilizadas):
        f()
    print("fixtures geradas em", os.path.abspath(PASTA))
