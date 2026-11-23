import React from 'react';
import { FileCheck2, Mail, MapPin, Shield, X } from 'lucide-react';

export const PRIVACY_POLICY_VERSION = '2026-11-v1';
export const PRIVACY_CONSENT_STORAGE_KEY = 'gr_privacy_consent_v1';

export default function PrivacyPolicyModal({ abierto, onCerrar, onAceptar }) {
  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-politica-privacidad"
    >
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Cabecera */}
        <div className="bg-petroleo text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0 border-b-4 border-ladrillo">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-hueso" />
            </div>
            <div className="min-w-0">
              <h3 id="titulo-politica-privacidad" className="font-black text-sm sm:text-base leading-tight">
                Política de Privacidad y Términos de Uso
              </h3>
              <p className="text-[11px] text-petroleo-100 truncate">
                Ley 25.326 • GR Servicios Contables – Estudio Impositivo Digital
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar Política de Privacidad"
            className="p-1.5 rounded-xl hover:bg-white/15 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido legible y estructurado */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed">
          {/* 1. Responsable */}
          <section className="bg-hueso/60 border border-hueso-border rounded-2xl p-3.5 space-y-1.5">
            <h4 className="font-black text-petroleo text-xs uppercase tracking-wide">
              1. Responsable del Tratamiento de Datos
            </h4>
            <p className="font-bold text-slate-900">
              GR Servicios Contables – Estudio Impositivo Digital
            </p>
            <p>
              <strong>CUIT:</strong> <span className="font-mono">20-30221167-2</span>
            </p>
            <p className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-ladrillo shrink-0" />
              <span>San Martín 315, Cerrillos, Provincia de Salta, República Argentina</span>
            </p>
            <p className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-ladrillo shrink-0" />
              <a
                href="mailto:gr.servicioscontable@gmail.com"
                className="font-bold text-petroleo underline"
              >
                gr.servicioscontable@gmail.com
              </a>
            </p>
          </section>

          {/* 2. Finalidad y datos tratados */}
          <section className="space-y-1.5">
            <h4 className="font-black text-petroleo text-xs uppercase tracking-wide">
              2. Datos Recopilados y Finalidad del Tratamiento
            </h4>
            <p>
              En cumplimiento de la <strong>Ley Nacional N.° 25.326 de Protección de Datos Personales</strong> y normas
              complementarias, informamos que los datos personales, fiscales, bancarios y documentales proporcionados
              (CUIT, nombre/razón social, categoría de Monotributo, solicitudes de facturación, comprobantes de compras
              y gastos, constancias, VEPs y extractos bancarios o de billeteras virtuales) son tratados exclusivamente
              para la prestación de servicios profesionales contables, impositivos y de autogestión del contribuyente.
            </p>
            <p>
              GR Servicios Contables <strong>no vende, alquila ni cede</strong> tus datos personales a terceros con
              fines comerciales o publicitarios.
            </p>
          </section>

          {/* 3. Uso de IA */}
          <section className="space-y-1.5">
            <h4 className="font-black text-petroleo text-xs uppercase tracking-wide">
              3. Uso de Inteligencia Artificial (IA) en Comprobantes y Extractos
            </h4>
            <p>
              Para agilizar la registración y conciliación contable, las imágenes, archivos PDF y extractos CSV que
              cargues en la aplicación pueden procesarse de forma automatizada mediante modelos de Inteligencia
              Artificial (Google Gemini, invocados únicamente desde el servidor seguro de Google Apps Script del
              estudio, sin claves privadas expuestas en tu dispositivo).
            </p>
            <p>
              La lectura por IA tiene carácter <strong>asistivo</strong>: podés revisar y corregir los datos antes de
              enviarlos, y todas las operaciones fiscales (incluida la emisión de Facturas C o Notas de Crédito C ante
              ARCA) quedan sujetas a control y validación profesional del estudio.
            </p>
          </section>

          {/* 4. Transferencia internacional */}
          <section className="space-y-1.5">
            <h4 className="font-black text-petroleo text-xs uppercase tracking-wide">
              4. Almacenamiento y Transferencia Internacional de Datos
            </h4>
            <p>
              La plataforma funciona sobre infraestructura tecnológica de clase mundial que puede alojar y procesar
              información en servidores ubicados fuera de la República Argentina, bajo medidas de cifrado en tránsito
              (HTTPS/TLS) y controles de acceso restringido:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Google LLC</strong> (Google Workspace, Google Sheets, Google Drive, Google Apps Script y Google
                Gemini) para el resguardo documental, cálculo impositivo y procesamiento asistido por IA.
              </li>
              <li>
                <strong>Vercel Inc.</strong> para el alojamiento seguro de la interfaz progresiva (PWA).
              </li>
            </ul>
            <p>
              Al aceptar esta política, prestás consentimiento expreso para dicha transferencia internacional
              necesaria para la ejecución del servicio contratado (Art. 12 Ley 25.326).
            </p>
          </section>

          {/* 5. Seguridad y acceso biométrico */}
          <section className="space-y-1.5">
            <h4 className="font-black text-petroleo text-xs uppercase tracking-wide">
              5. Seguridad, Sesión Local y Acceso Biométrico
            </h4>
            <p>
              La aplicación almacena en tu dispositivo únicamente tu sesión de acceso y, si decidís activarlo, una
              credencial local WebAuthn vinculada al bloqueo de tu celular (huella digital, reconocimiento facial o PIN
              del teléfono). Tus datos biométricos <strong>nunca salen de tu dispositivo</strong> ni son enviados o
              almacenados por GR Servicios Contables.
            </p>
          </section>

          {/* 6. Derechos del titular */}
          <section className="space-y-1.5">
            <h4 className="font-black text-petroleo text-xs uppercase tracking-wide">
              6. Derechos de Acceso, Rectificación, Supresión y Revocación
            </h4>
            <p>
              Como titular de los datos personales, podés ejercer gratuitamente el derecho de <strong>acceso</strong>{' '}
              (en intervalos no inferiores a seis meses, salvo interés legítimo acreditado), así como solicitar la{' '}
              <strong>rectificación, actualización, supresión</strong> o la <strong>revocación del consentimiento</strong>{' '}
              escribiendo a{' '}
              <a
                href="mailto:gr.servicioscontable@gmail.com"
                className="font-bold text-petroleo underline"
              >
                gr.servicioscontable@gmail.com
              </a>
              . La revocación no tendrá efectos retroactivos y quedará sujeta a los plazos legales vigentes de
              conservación de documentación contable y tributaria ante ARCA y organismos provinciales.
            </p>
            <p className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[11px] text-slate-600">
              <strong>Ley 25.326 (Art. 14 inc. 3):</strong> La <em>Agencia de Acceso a la Información Pública (AAIP)</em>,
              en su carácter de Órgano de Control de la Ley N.° 25.326, tiene la atribución de atender las denuncias y
              reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas
              vigentes en materia de protección de datos personales.
            </p>
          </section>

          {/* 7. Términos de uso */}
          <section className="space-y-1.5">
            <h4 className="font-black text-petroleo text-xs uppercase tracking-wide">
              7. Términos de Uso de la Plataforma
            </h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                El acceso mediante CUIT, PIN personal y/o bloqueo biométrico es personal e intransferible. Sos
                responsable de mantener la confidencialidad de tus credenciales y de cerrar sesión en dispositivos
                compartidos.
              </li>
              <li>
                La veracidad, integridad y respaldo legal de los comprobantes y datos cargados corresponden al
                contribuyente titular.
              </li>
              <li>
                Las proyecciones del Simulador de Monotributo y el semáforo de categorías son orientativos y se basan
                en la información disponible hasta la última sincronización con el estudio.
              </li>
            </ul>
          </section>

          <p className="text-[10px] text-slate-400 text-right pt-1">
            Versión vigente: {PRIVACY_POLICY_VERSION} • Cerrillos, Salta, Argentina
          </p>
        </div>

        {/* Pie con acciones */}
        <div className="p-4 border-t border-slate-200 bg-[#F8FAFC] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onCerrar}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-extrabold text-xs transition"
          >
            Cerrar
          </button>
          {onAceptar && (
            <button
              type="button"
              onClick={onAceptar}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs shadow-sm transition"
            >
              <FileCheck2 className="w-4 h-4 text-hueso" />
              <span>Aceptar Política y Términos</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
