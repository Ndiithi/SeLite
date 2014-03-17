"use strict";

SeLiteExtensionSequencer.registerPlugin( {
    pluginId: 'auto-check@selite.googlecode.com',
    coreUrl: ['chrome://selite-auto-check/content/extensions/auto-check.js',
              'chrome://selite-auto-check/content/AutoCheck.js'],
    requisitePlugins: {
        'bootstrap@selite.googlecode.com': 'SeLite Bootstrap',
        'settings@selite.googlecode.com': 'SeLite Settings'
    },
    callBack: function(api) {
        Components.utils.import("chrome://selite-settings/content/SeLiteSettings.js" );
        var settingsModule= SeLiteSettings.loadFromJavascript( 'extensions.selite-settings.common' );
        var autoCheckDetector= new SeLiteSettings.Field.Choice.String('autoCheckDetector', false, undefined, {DectectorPHP:"SeLiteAutoCheck.DetectorPHP"} );
        var autoCheckDetectorCustom= new SeLiteSettings.Field.String( 'autoCheckDetectorCustom', false, undefined, false );
        var autoCheckDetectorCustomURL= new SeLiteSettings.Field.String( 'autoCheckDetectorCustomURL', false, undefined, false );
        var autoCheckAssert= new SeLiteSettings.Field.Bool( 'autoCheckAssert', false, false );
        var autoCheckRequired= new SeLiteSettings.Field.String( 'autoCheckRequired', true, [], false );
        var autoCheckRefused= new SeLiteSettings.Field.String( 'autoCheckRefused', true, [], false );
        var autoCheckIgnored= new SeLiteSettings.Field.String( 'autoCheckIgnored', true, [], false );
        settingsModule.addFields( [autoCheckDetector, autoCheckDetectorCustom, autoCheckAssert, autoCheckRequired, autoCheckRefused, autoCheckIgnored] );
    }
} );
