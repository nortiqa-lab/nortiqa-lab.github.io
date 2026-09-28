# Security Policy

## Reporting
No publiques vulnerabilidades, secretos, credenciales ni datos sensibles en Issues, PRs o Discussions.

Reportá incidentes de seguridad por el canal interno autorizado de NORTIQA y vinculá el hallazgo a la documentación DEV correspondiente.

## Secrets
- No commitear claves, tokens, cookies, certificados privados ni archivos `.env`.
- Usar GitHub Secrets/Environment Secrets o el vault aprobado.
- Rotar credenciales ante exposición real o sospechada.

## Scope
Cambios de seguridad en infraestructura, autenticación, permisos, secretos, CI/CD o producción requieren revisión técnica antes de merge.

## Entity isolation
NORTIQA, Valent, LLA Santa Cruz y SC2027 deben permanecer separados. No incluir datos, secretos o runtime de otra entidad salvo interfaz explícita aprobada.

## Production
Un merge no autoriza un deploy. PROD requiere el gate operativo vigente.
