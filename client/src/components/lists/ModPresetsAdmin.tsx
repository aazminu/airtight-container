import PresetsAdmin from './PresetsAdmin';
import {
  publishModPresets,
  type ModPreset,
} from '../forms/modificationPresets';

export default function ModPresetsAdmin() {
  return (
    <PresetsAdmin<ModPreset>
      apiPath="/api/v2/mod-presets"
      title="Modification Presets"
      subtitle="Suggested descriptions for the modifications field on invoice line items. Free text is always allowed; these just appear as typeahead. The default price autofills into the modification price when the editor matches the label exactly."
      addPlaceholder="New preset label"
      removeMessage={(label) =>
        `"${label}" will no longer appear in the modification description suggestions. Existing invoices keep their text.`
      }
      publishFn={publishModPresets}
      showPrice
    />
  );
}
