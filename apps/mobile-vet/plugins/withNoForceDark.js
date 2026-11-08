// Config plugin: android:forceDarkAllowed=false en AppTheme.
// La app es solo clara (userInterfaceStyle "light"), pero Samsung y el "forzar modo oscuro"
// de Android invierten sus colores a medias (texto blanco sobre cards blancas). La carpeta
// android/ está en .gitignore: esto deja el ajuste aplicado si se vuelve a generar con prebuild.
const { withAndroidStyles, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withNoForceDark(config) {
  return withAndroidStyles(config, (cfg) => {
    cfg.modResults = AndroidConfig.Styles.assignStylesValue(cfg.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:forceDarkAllowed',
      value: 'false',
    });
    return cfg;
  });
};
