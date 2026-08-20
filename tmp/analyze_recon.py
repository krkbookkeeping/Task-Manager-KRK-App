import pdfplumber
import re

statement = r"C:\Users\KenRK\Barc's Rescue\Accounting - Documents\01 Bank 2026\Scotiabank\Bank Statements\2026-06\2026-06-30 Chq Statement - rec copy.pdf"
report = r"C:\Users\KenRK\Barc's Rescue\Accounting - Documents\01 Bank 2026\Scotiabank\Bank Statements\2026-06\Bank Rec Report QBO - 2606.pdf"

money = re.compile(r"^\d{1,3}(?:,\d{3})*\.\d{2}$")
date = re.compile(r"^\d{2}/\d{2}/\d{4}$")

unmarked = []
statement_amounts = []
with pdfplumber.open(statement) as pdf:
    for page_no, page in enumerate(pdf.pages, 1):
        words = page.extract_words()
        circles = [c for c in page.curves if c.get("fill") and 7 < c.get("width", 0) < 14 and 7 < c.get("height", 0) < 14]
        dates = [w for w in words if date.match(w["text"])]
        for d in dates:
            row_words = [w for w in words if abs(w["top"] - d["top"]) < 2]
            amounts = [w for w in row_words if money.match(w["text"]) and 320 < w["x0"] < 540]
            if not amounts:
                continue
            amount = amounts[0]
            statement_amounts.append(float(amount["text"].replace(",", "")))
            marked = any(abs((c["top"] + c["bottom"])/2 - (amount["top"] + amount["bottom"])/2) < 9 for c in circles)
            # Collect words up to next dated row, to identify the transaction
            next_tops = [x["top"] for x in dates if x["top"] > d["top"] + 2]
            end = min(next_tops) if next_tops else 9999
            description = " ".join(w["text"] for w in words if d["top"] <= w["top"] < end and 80 < w["x0"] < 320)
            if not marked:
                unmarked.append((page_no, d["text"], amount["text"], description[:80]))

print("UNMARKED STATEMENT TRANSACTIONS")
for row in unmarked:
    print(" | ".join(map(str, row)))

print("\nQBO CHECKED PAYMENT ROWS (amounts around 900-1100)")
checked_payments = []
checked_deposits = []
with pdfplumber.open(report) as pdf:
    for page_no, page in enumerate(pdf.pages, 1):
        words = page.extract_words()
        checks = [w for w in words if w["text"] == "✓"]
        for check in checks:
            row = [w for w in words if abs(w["top"] - check["top"]) < 3]
            vals = [w["text"] for w in row if money.match(w["text"])]
            if vals:
                amount_word = [w for w in row if money.match(w["text"]) and 390 < w["x0"] < 570]
                if amount_word:
                    amount = amount_word[0]
                    record = (float(amount["text"].replace(",", "")), page_no, " ".join(w["text"] for w in row if w["x0"] < 500))
                    (checked_payments if amount["x0"] < 485 else checked_deposits).append(record)

from collections import Counter
statement_counter = Counter(statement_amounts)
for kind, records in [("PAYMENTS", checked_payments), ("DEPOSITS", checked_deposits)]:
    counts = Counter(x[0] for x in records)
    print(f"\nCHECKED QBO {kind} WITH MORE INSTANCES THAN WHOLE STATEMENT")
    for amount, count in sorted(counts.items()):
        if count > statement_counter[amount]:
            print(amount, count, "statement:", statement_counter[amount], [r[2] for r in records if r[0] == amount])
print("\nTOTALS", sum(x[0] for x in checked_payments),sum(x[0] for x in checked_deposits),sum(statement_amounts))
