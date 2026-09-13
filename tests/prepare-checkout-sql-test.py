# สร้าง regression SQL โดยใช้ function ปัจจุบันกับตารางชั่วคราวเท่านั้น
from pathlib import Path
root = Path(__file__).resolve().parents[1]
sql = (root / "supabase/migrations/138_checkout_split_payments.sql").read_text().split("revoke all")[0]
for table in ["profiles", "visits", "role_permissions", "invoice_headers", "invoice_items", "payment_logs", "clinic_day_closes"]:
    sql = sql.replace("public." + table, "pg_temp." + table)
sql = sql.replace("public.create_checkout_invoice", "pg_temp.test_checkout_invoice").replace("auth.uid()", "'00000000-0000-0000-0000-000000000001'::uuid")
print((root / "tests/checkout-split-fixtures.sql").read_text().replace("-- FUNCTION_UNDER_TEST", sql))
