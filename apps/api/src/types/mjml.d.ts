declare module 'mjml' {
  type MJMLParseResults = { html: string; errors?: any[] }
  export default function mjml2html(source: string, options?: any): MJMLParseResults
}


