# ERP TML - BACKEND FOUNDATION PROMPT

## OBJETIVO

Implementar la base sólida y escalable del backend del ERP TML siguiendo estrictamente:

* MASTER_SYSTEM_PROMPT.md
* STOCK_ENGINE_PROMPT.md
* ARCHITECTURE_PROMPT.md

No improvisar arquitectura distinta.

---

# OBJETIVO DE ESTA ETAPA

Construir:

* estructura backend completa
* auth base
* permisos
* middleware auth
* middleware permisos
* prisma singleton
* manejo global de errores
* sistema base de auditoría
* estructura services/repositories
* tipado estricto
* base preparada para stock engine

---

# ESTRUCTURA OBLIGATORIA

src/backend/

* routes/
* controllers/
* services/
* repositories/
* middlewares/
* validators/
* db/
* utils/
* types/
* scripts/

Crear estructura modular limpia.

---

# IMPLEMENTAR

## 1. PRISMA SINGLETON

Crear singleton reutilizable.

Evitar múltiples conexiones Prisma.

---

## 2. AUTH BASE

Implementar:

POST /api/auth/login

Usar:

* bcrypt
* JWT
* cookies httpOnly

Nunca usar localStorage para auth.

---

# JWT

Implementar middleware:

* requireAuth

Debe:

* validar token
* obtener usuario
* inyectar req.user

---

# 3. SISTEMA DE PERMISOS

Implementar:

* requirePermission(permission)

Permisos dinámicos.

NO usar roles rígidos.

---

# 4. ERROR HANDLER GLOBAL

Implementar:

* AppError
* middleware global

Responder errores consistentes.

---

# 5. RESPONSE FORMAT

Todas las respuestas deben seguir formato consistente.

Ejemplo:

{
success: true,
data: ...
}

Errores:

{
success: false,
error: ...
}

---

# 6. AUDITORÍA BASE

Preparar estructura para registrar:

* usuario
* acción
* fecha
* observaciones

No implementar completo aún.

Solo preparar arquitectura.

---

# 7. VALIDACIONES

Usar:

* zod

Separar:

* validators
* lógica services

---

# 8. SERVICES Y REPOSITORIES

Implementar ejemplo funcional limpio.

Nunca usar Prisma directo desde controllers.

---

# 9. VARIABLES DE ENTORNO

Centralizar validación de envs.

Ejemplos:

* DATABASE_URL
* JWT_SECRET

---

# 10. TYPES GLOBALES

Agregar:

* RequestWithUser
* AuthUser
* tipos reutilizables

---

# IMPORTANTE

NO implementar todavía:

* stock engine completo
* movimientos completos
* reportes
* PDFs
* talleres completos

Solo dejar backend preparado profesionalmente.

---

# REGLAS IMPORTANTES

## NUNCA

* lógica de negocio en routes
* Prisma en frontend
* any innecesarios
* middleware duplicado
* validaciones duplicadas

---

# SIEMPRE

* TypeScript estricto
* código modular
* arquitectura limpia
* funciones pequeñas
* nombres claros

---

# RESULTADO ESPERADO

Backend profesional listo para:

* stock engine
* movimientos
* talleres
* depósitos
* reportes
* escalabilidad futura
