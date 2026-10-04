# DSH 0.2 compatibility

This release requires DSH 0.2.1-alpha.1 or a compatible 0.2 release. The verified upstream revision is 5badb15009ae1756c3afe0ae0cef1faafc290ccc.

Host settings use volatile Config values and the client reads ConfigForms. Plugin-origin context uses named message-source discriminators.

Install the fixed commit reachable from the repository main branch through dsh plugin. The shared environment stores full commit ids; local source paths are not portable plugin pins.

Git prepare installs schemastery as a development dependency to build its browser configuration schema independently of the profile peer installation.

The maintenance lockfile disables implicit peer installation and uses the current Cordis and schemastery versions. Git packages build without depending on the source checkout node_modules.
