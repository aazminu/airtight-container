import PresetsAdmin from './PresetsAdmin';
import {
  publishSizePresets,
  type SizePreset,
} from '../forms/sizePresets';

export default function SizePresetsAdmin() {
  return (
    <PresetsAdmin<SizePreset>
      apiPath="/api/v2/size-presets"
      title="Container Sizes"
      subtitle={`Suggested options for the size field on intake and the inventory editor. Free text is still accepted for legacy values; only listed entries appear in the typeahead.`}
      addPlaceholder="New size label (e.g. 20'DV)"
      removeMessage={(label) =>
        `"${label}" will no longer appear in the size suggestions. Containers already labeled "${label}" keep their value.`
      }
      publishFn={publishSizePresets}
    />
  );
}
