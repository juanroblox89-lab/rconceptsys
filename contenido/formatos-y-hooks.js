/**
 * Mock Data for Creative Production OS
 */

export const formats = [
    {
        id: "RC-01",
        name: "Recorrido Comercial",
        objective: "Generar autoridad y mostrar infraestructura.",
        structure: "Intro Gancho > Recorrido POV > Beneficios > CTA",
        hooks: ["Problema-Solución", "POV Curiosidad"],
        kpis: "Retención > 45%"
    },
    {
        id: "ED-02",
        name: "Educativo Rápido",
        objective: "Posicionamiento experto y valor gratuito.",
        structure: "Hook Educación > Paso 1 > Paso 2 > Paso 3 > CTA",
        hooks: ["Sabías que?", "Error común"],
        kpis: "Guardados > Compartidos"
    }
];

export const hooks = [
    {
        category: "Descubrimiento",
        title: "¿Sabías que el 90% de...?",
        psychology: "Curiosidad por estadística chocante.",
        retention: "Alta"
    },
    {
        category: "Problema",
        title: "Deja de cometer este error en...",
        psychology: "Miedo a la pérdida o ineficiencia.",
        retention: "Muy Alta"
    }
];

export const clients = [
    {
        name: "Gimnasio Elite",
        style: "High Contrast / Energetic",
        formats: ["RC-01", "HK-04"],
        active: true
    },
    {
        name: "Barbería Classic",
        style: "Vintage / Moody",
        formats: ["HK-04", "ED-02"],
        active: true
    }
];
