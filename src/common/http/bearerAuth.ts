/**
 * Nome estavel do esquema Bearer no OpenAPI. Fica fora de `app.setup.ts` para
 * que os controllers possam referencia-lo sem importar o bootstrap HTTP.
 */
export const BEARER_SECURITY_SCHEME = 'bearer';
