/**
 * Cola offline de visitas F4 (BRIEF F4 §2, ANALISIS §5.23):
 * - Si no hay red, la visita se guarda en IndexedDB y se sincroniza sola al
 *   volver la señal (evento `online` + reintento al abrir la app).
 * - Nunca se pierde una visita si se cierra la app (persistencia IndexedDB).
 * - Idempotencia con `client_id` UUID generado en el celular (el backend
 *   ignora duplicados aunque el POST se repita).
 * - Fotos: se guardan como data comprimida junto a la visita pendiente.
 */

export interface VisitaPendiente {
  client_id: string;
  lead_id?: string;
  negocio?: string;
  telefono?: string;
  municipio?: string;
  direccion?: string;
  barrio?: string;
  latitud: number | null;
  longitud: number | null;
  notas: string;
  resultado: string;
  cuando: string;
  fotos: string[];
  creada: number;
}

const DB_NOMBRE = "rc-ventas";
const DB_STORE = "visitas-pendientes";

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NOMBRE, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE, { keyPath: "client_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function conStore<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, modo);
      const req = fn(tx.objectStore(DB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export function nuevoClientID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cli-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export async function guardarPendiente(
  v: Omit<VisitaPendiente, "client_id" | "creada"> & { client_id?: string },
): Promise<string> {
  const client_id = v.client_id ?? nuevoClientID();
  const full: VisitaPendiente = {
    ...v,
    client_id,
    creada: Date.now(),
    latitud: v.latitud ?? null,
    longitud: v.longitud ?? null,
    fotos: v.fotos ?? [],
  };
  await conStore("readwrite", (s) => s.put(full));
  return client_id;
}

export async function listarPendientes(): Promise<VisitaPendiente[]> {
  try {
    const todas = await conStore<VisitaPendiente[]>("readonly", (s) =>
      s.getAll(),
    );
    return (todas ?? []).sort((a, b) => a.creada - b.creada);
  } catch {
    return [];
  }
}

export async function borrarPendiente(client_id: string): Promise<void> {
  try {
    await conStore("readwrite", (s) => s.delete(client_id));
  } catch {
    // Si no se puede borrar, se reintentará (el backend ignora duplicados).
  }
}

export async function contarPendientes(): Promise<number> {
  try {
    const todas = await listarPendientes();
    return todas.length;
  } catch {
    return 0;
  }
}
