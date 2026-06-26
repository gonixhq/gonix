"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Language = "th" | "en";

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const translations = {
    en: {
        // Navigation
        dashboard: "Overview",
        patients: "Patients",
        queueBoard: "Queue Board",
        visitRegistry: "Registration & Screening",
        appointments: "Appointments",
        pharmacy: "Pharmacy & Payment",
        inventory: "Inventory",
        finance: "Finance",
        commissions: "DF / Commission",
        compensation: "Compensation",
        affiliates: "Affiliate Sales",
        checkin: "Clock In/Out (GPS)",
        settings: "Settings",
        reports: "Reports",
        insights: "Business Insights",
        branches: "Branches",
        staff: "Staff",
        lab: "Lab",
        anonymous: "Anonymous Clinic",
        audit: "Activity Log",
        // Sub-menus & Actions
        addPatient: "Add Patient",
        screening: "Open Visit & Screening",
        doctorStation: "Doctor Room",
        doctorSchedule: "Work Schedule",
        dispense: "Dispense",
        eod: "End of Day",
        rooms: "Consultation Rooms",
        services: "Services & Pricing",
        formulas: "Drug / Vitamin Formulas",
        save: "Save",
        cancel: "Cancel",
        // System
        logout: "Logout",
        language: "Language",
    },
    th: {
        // Navigation
        dashboard: "ภาพรวม (Overview)",
        patients: "ทะเบียนผู้ป่วย",
        queueBoard: "กระดานคิว (Queue)",
        visitRegistry: "ลงทะเบียน & ซักประวัติ",
        appointments: "นัดหมาย",
        pharmacy: "ห้องยา & รับเงิน",
        inventory: "คลังสินค้า",
        finance: "การเงิน",
        commissions: "ค่า DF / Commission",
        compensation: "ค่าตอบแทนพนักงาน",
        affiliates: "เซลล์ฟรีแลนซ์",
        checkin: "ตอกบัตร (GPS)",
        settings: "ตั้งค่าระบบ",
        reports: "รายงาน",
        insights: "รายงานธุรกิจ",
        branches: "สาขา",
        staff: "พนักงาน",
        lab: "ห้องแล็บ",
        anonymous: "คลินิกนิรนาม",
        audit: "ประวัติการดำเนินการ",
        // Sub-menus & Actions
        addPatient: "เพิ่มผู้ป่วยใหม่",
        screening: "เปิด Visit & ซักประวัติ",
        doctorStation: "ห้องแพทย์ (Doctor Room)",
        doctorSchedule: "ตารางเวร",
        dispense: "จ่ายยา",
        eod: "ปิดยอดประจำวัน",
        rooms: "จัดการห้องตรวจ",
        services: "รายการบริการ & ราคา",
        formulas: "สูตรยา / วิตามิน",
        save: "บันทึกข้อมูล",
        cancel: "ยกเลิก",
        // System
        logout: "ออกจากระบบ",
        language: "ภาษา (Language)",
    }
};

const LanguageContext = createContext<LanguageContextType>({
    language: "th",
    setLanguage: () => { },
    t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>("th");

    useEffect(() => {
        const savedLang = localStorage.getItem("gonix_lang") as Language;
        if (savedLang && (savedLang === "th" || savedLang === "en")) {
            setLanguageState(savedLang);
        }
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem("gonix_lang", lang);
    };

    const t = (key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (translations[language] as any)[key] || key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export const useLanguage = () => useContext(LanguageContext);
