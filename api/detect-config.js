// Detects which saved config applies to the uploaded document using Gemini.
// Does NOT deduct credits — detection is free, it just routes to the right config.

import { getUser } from './_lib/supabaseAdmin.js';
import { callGeminiWithSchema } from './_lib/gemini.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const { fileData, mimeType, configs = [] } = req.body || {};

  if (!fileData || !mimeType) return res.json({ matched_config_id: null });

  const withTriggers = configs.filter(c => Array.isArray(c.triggers) && c.triggers.length > 0);
  if (!withTriggers.length) return res.json({ matched_config_id: null });

  const configList = withTriggers.map((c, i) => {
    const pairs = c.triggers
      .map((t) => {
        if (t.match_type === 'value_only' || !t.field_name) {
          return `  - Debe aparecer el valor "${t.field_value}" en alguna parte del documento, aunque no se conozca el campo exacto`;
        }

        return `  - El campo "${t.field_name}" debe contener el valor "${t.field_value}"`;
      })
      .join('\n');
    return `Configuración ${i + 1}, id="${c.id}":\n${pairs}`;
  }).join('\n\n');

  const prompt = `Analiza este documento. Determina cuál de las siguientes configuraciones aplica.

Reglas de matching:
- Una configuración aplica si TODAS sus reglas se encuentran en el documento.
- El "campo" es una etiqueta conceptual (ej: "RUT proveedor", "RFC", "Proveedor") — búscalo semánticamente en el documento, no como texto literal.
- El "valor" puede aparecer con formato diferente: ignora puntos, guiones, espacios y mayúsculas al comparar. Por ejemplo "12.345.678-9" y "12345678-9" y "12.345.6789" son equivalentes.
- Si una regla pide un campo + valor, el valor encontrado en ese campo debe contener el valor del trigger (o ser equivalente ignorando formato).
- Si una regla pide solo un valor específico, basta con que ese valor aparezca claramente en alguna parte del documento, aunque no puedas asociarlo a un campo concreto.

${configList}

Responde SOLO con un objeto JSON con esta estructura:
{
  "matched_id": "el id exacto de la configuración que aplica, o cadena vacía si ninguna aplica",
  "matched_pairs": [
    {
      "field_name": "nombre conceptual del campo usado para validar",
      "required_value": "valor requerido por la regla",
      "extracted_value": "valor encontrado en el documento que justifica la coincidencia"
    }
  ]
}

Si ninguna configuración aplica, devuelve "matched_id" como cadena vacía y "matched_pairs" como un arreglo vacío.`;

  try {
    const schema = {
      type: 'object',
      properties: {
        matched_id: { type: 'string' },
        matched_pairs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field_name: { type: 'string' },
              required_value: { type: 'string' },
              extracted_value: { type: 'string' },
            },
            required: ['field_name', 'required_value', 'extracted_value'],
          },
        },
      },
      required: ['matched_id', 'matched_pairs'],
    };

    const parsed = await callGeminiWithSchema(fileData, mimeType, prompt, schema);
    const matchId = parsed?.matched_id;

    // Validate it's one we actually sent
    const valid = withTriggers.find(c => c.id === matchId);
    if (!valid) return res.json({ matched_config_id: null, matched_pairs: [] });

    const matchedPairs = valid.triggers.map((trigger) => {
      const pair = (parsed?.matched_pairs || []).find((item) => {
        if (item.required_value !== trigger.field_value) return false;
        if (trigger.match_type === 'value_only' || !trigger.field_name) return true;
        return item.field_name === trigger.field_name;
      });

      return {
        field_name: trigger.match_type === 'value_only' || !trigger.field_name
          ? 'Valor específico'
          : trigger.field_name,
        required_value: trigger.field_value,
        extracted_value: pair?.extracted_value || 'Coincidencia encontrada',
      };
    });

    return res.json({ matched_config_id: valid.id, matched_pairs: matchedPairs });
  } catch {
    return res.json({ matched_config_id: null, matched_pairs: [] });
  }
}
