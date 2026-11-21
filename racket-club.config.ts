/**
 * Build-time configuration: which plugins are compiled into this deployment.
 *
 * Installing a plugin = adding it here and deploying. Activating it is done at runtime
 * by the coach in Admin > Plugins (installed plugins start switched off).
 * Theme plugins are listed here too; the coach picks the active one in Admin > Settings > Appearance.
 */
import gamification from './plugins/gamification/src/index';
import stringing from './plugins/stringing/src/index';
import themeCourt from './plugins/theme-court/src/index';

export default {
  plugins: [stringing, gamification, themeCourt],
};
