/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Google Maps JavaScript API key used to power Places Autocomplete address
   * autofill on the client form. When unset, the form falls back to plain
   * manual-entry inputs and the autocomplete is not rendered.
   */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
