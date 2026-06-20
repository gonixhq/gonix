# 🔒 Future Feature: Anonymous Testing Module

> **Status:** Deferred — รอ core system stable ก่อน
> **Estimated effort:** 5-8 วัน (Phase 1-3)
> **Created:** 2026-05-29

## 📋 Use Case
ระบบลงทะเบียนตรวจคัดกรอง HIV/STI แบบไม่ระบุตัวตน
- คนไข้ลงทะเบียนออนไลน์ผ่านเว็บ ไม่ต้องบอกชื่อ
- รับรหัสอ้างอิง 6-10 หลัก (เช่น `TV-8X92-K3`)
- มาที่คลินิกแสดงรหัส → ตรวจ → รอผล
- เช็คผลออนไลน์ผ่านรหัส (เก็บ 7 วัน)
- ถ้าผลบวก + ต้องการรักษา → Convert เป็น patient ปกติ

---

## ⚖️ PDPA Critical Requirements

- ⚠️ **Section 26** — ข้อมูลอ่อนไหวระดับสูงสุด
- ✅ **Explicit consent** ต้องระบุชัดเจน
- ✅ **Data minimization** — เก็บน้อยที่สุด
- ✅ **Right to erasure** — hard delete จริง ไม่ใช่ soft
- ✅ **Audit trail** — ครบทุก access

---

## 🗂️ ตารางใหม่ที่ต้องสร้าง

```sql
anon_bookings (ref_code PK, booked_date, screening jsonb, status, ...)
anon_results (ref_code PK, result_type, test_kit_id, doctor_id, visible_until, ...)
anon_result_access_log (ref_code, accessed_at, ip_hash)
anon_conversion_log (ref_code, converted_to_hn, ...)
```

**ห้าม:**
- ❌ ปะปนกับ `patients` table
- ❌ เก็บเบอร์/อีเมล/ชื่อใน anon tables
- ❌ ส่ง SMS/Email/LINE
- ❌ มี index ที่ join anon_results → patients

---

## 🔄 Workflow

### Phase 1: MVP (ฟังก์ชันพื้นฐาน)
- [ ] DB schema + RLS + migration
- [ ] Public booking page `/anon/book/[clinicCode]`
- [ ] Generate ref_code (crypto.randomBytes, no confusable chars)
- [ ] Admin check-in page
- [ ] Result entry (Pos/Neg)
- [ ] Public result lookup `/anon/check` + rate limit
- [ ] Cancel/no-show manual flow

### Phase 2: Integration
- [ ] Inventory deduction (test kit จาก inventory)
- [ ] External lab cost tracking
- [ ] Auto-purge cron jobs (pg_cron):
  - No-show: 24h after booking → mark + delete
  - Result expiry: 7 days after result_at → hard delete
- [ ] Convert flow (anon → identified patient)
- [ ] Audit log for conversions

### Phase 3: Operations
- [ ] Anonymous stats dashboard (de-identified counts only)
- [ ] Receipt generation (no PII, แค่ "ผู้รับบริการรหัส XXXXXX")
- [ ] Multi-package support
- [ ] Walk-in flow (สร้าง ref_code ที่เคาน์เตอร์)

---

## ❓ Business Decisions ที่ต้องตอบก่อนเริ่ม

1. **Package** — กี่แบบ? ราคา?
2. **Payment** — เคาน์เตอร์เท่านั้น หรือ online payment?
3. **Test Methods** — rapid test / ส่งแลปนอก / ทั้งคู่
4. **Convert** — สร้าง patient ใหม่ทุกครั้ง หรือ link กับ existing
5. **Receipt format** — ใบเสร็จมาตรฐาน vs internal voucher
6. **Refund policy** — no-show / cancel
7. **Walk-in support** — Yes/No
8. **Staff permissions** — ใครเข้าได้
9. **Multi-clinic** — Tanavej only vs all tenants
10. **Result format** — Pos/Neg vs ค่าตัวเลข vs คำแนะนำ

---

## 🛡️ Security Checklist (ก่อน production)

- [ ] Rate limit on result lookup (5/min, 50/day, blacklist on abuse)
- [ ] ref_code unique constraint + retry on collision
- [ ] No PII in URLs (no query params with sensitive data)
- [ ] All anon endpoints in separate route group (`/anon/...`)
- [ ] Logs hash IP, no raw IP stored long-term
- [ ] Audit log immutable (no UPDATE/DELETE on log rows)
- [ ] PDPA consent text vetted by legal
- [ ] Pen test / vulnerability scan
- [ ] Backup encryption — separate key from main system
- [ ] Annual review of anon_conversion_log

---

## 📝 Notes for Implementation

- ใช้ Supabase Edge Functions หรือ pg_cron สำหรับ auto-purge
- Generate ref_code ด้วย `crypto.randomBytes`, ตัด confusable chars (0/O, 1/I, L)
- Frontend: shadcn modal warnings ชัดเจน "ผลตรวจจะถูกลบใน 7 วัน"
- Backend: ใช้ transaction สำหรับ convert flow (atomic anon→patient)
- Consider: rate limit per `ref_code` (เช็คผลตัวเอง 10 ครั้ง/ชม.)
