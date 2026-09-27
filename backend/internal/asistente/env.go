// getenvOS lee el entorno real. Vive en su propio archivo para que los
// tests lo reemplacen inyectando getenv sin importar os en proveedor.go.
package asistente

import "os"

func getenvOS(k string) string { return os.Getenv(k) }
