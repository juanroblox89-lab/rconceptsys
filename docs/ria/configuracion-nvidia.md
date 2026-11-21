# Respaldo NVIDIA de RIA

Configura estas variables solo en el backend de RIA. No pongas sus valores en el repositorio ni en variables públicas del frontend.

| Variable | Uso |
|---|---|
| `NVIDIA_API_KEYS` | Lista opcional de claves separadas por comas. Se ignoran los espacios alrededor de cada clave y las entradas vacías. |
| `NVIDIA_API_KEY` | Clave única si no hay lista. Si se configura junto a la lista, se añade al final solo si no está ya incluida. |
| `RIA_MODELO_RESPALDO` | Modelo opcional. El valor predeterminado es `nvidia/nemotron-3.5-super-vl-120b-a12b`. |

El backend llama directamente a `https://integrate.api.nvidia.com/v1/chat/completions`, sin pasar por 9router. Cada solicitud que usa el respaldo empieza por la siguiente clave (round-robin por instancia). Si recibe 429, 5xx o vence la espera antes de que llegue el primer fragmento, avanza a la siguiente clave sin repetir ninguna. Si todas fallan o el solicitante cancela o agota el tiempo de la solicitud, termina con un error que no incluye credenciales. Si ya empezó a mostrar texto, no mezcla fragmentos de otra respuesta.

Las pruebas locales usan servidores simulados. No necesitan credenciales de NVIDIA.
