import PresetsAdmin from './PresetsAdmin';
import {
  publishDamagePresets,
  type DamagePreset,
} from '../forms/damagePresets';

export default function DamagePresetsAdmin() {
  return (
    <PresetsAdmin<DamagePreset>
      apiPath="/api/v2/damage-presets"
      title="Damage Types"
      subtitle="Suggested options for the damage field on intake and the inventory editor. Free text is still accepted; only listed entries appear in the typeahead."
      addPlaceholder="New damage label (e.g. WWT)"
      removeMessage={(label) =>
        `"${label}" will no longer appear in the damage suggestions. Containers already labeled "${label}" keep their value.`
      }
      publishFn={publishDamagePresets}
    />
  );
}
