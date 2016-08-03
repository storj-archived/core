Contributing
============

Want to contribute, but not sure where to start? Check out our [issue
board](http://waffle.io/storj/core)!

This document outlines general patterns and conventions for contributing
to the project. For in-depth documentation on StorjCORE, [read the
documentation](http://storj.github.io/core).

Contributor License Agreement
-----------------------------

By submitting pull requests, you agree that your work may be licensed under
one of:

* GNU Affero General Public License Version 3 (or later)
* GNU Lesser General Public License Version 3 (or later)

You also assert that you have completed the
[Contributor License Agreement](https://storj.io/cla)

Reporting Issues
----------------

When submitting an issue, please take care to follow the
`ISSUE_TEMPLATE.md` and include as much information as possible. Bonus points
for a corresponding pull request that fixes the issue.

Pull Requests for Swag
----------------------
We love pull requests, so to encourage more of them we are offering
awesome swag. Only SIGNIFICANT pull requests count. Fixing a comma
doesn’t count, but fixing a bug, adding more test coverage, or writing
guides & documentation does.

- Make 1x pull requests to get into the contributors list and website
- Make 2x pull requests, we will send you a packet of stickers
- Make 5x pull requests, and we will send you a t-shirt and more stickers
- Make 10x pull requests, and you get a job interview with James + other swag

If we miss a milestones (probably because we are working hard), just let
us know so we can get you your swag.

Style & Conventions
-------------------

### Style Guide

StorjCORE adheres to
[Felix's Node.js Style Guide](https://github.com/felixge/node-style-guide).
Please take the time to review the style guide and take care to follow it.

### Project Structure

* `bin/` - Command line utilities linked during global installation
* `dist/` - Placeholder for browser bundles generated with `npm run build`
* `doc/` - Markdown documentation on various topics not covered by JSDoc
* `lib/` - All core classes and modules
* `script/` - Miscellaneous scripts and utilities used for development
* `test/` - Unit and integration tests for core classes and modules

### Inline Documentation

You should also make the best use of [JSDoc](http://usejsdoc.org/) comments as
shown throughout the source code. These annotation are used to generate the
library's documentation website. Please be as descriptive as possible and take
care to familiarize yourself with all of the possible JSDoc tags for
being as thorough as possible.

Test Coverage
-------------

Pull requests submitted without additional test coverage are unlikely to be
merged. Pull requests that decrease test coverage will be rejected. If your
submission fixes a bug that was not previously caught with the test suite, then
please add an additional test that does cover it.

You can run the coverage report with:

```
npm run coverage
```

Linting
-------

To help maintain consistent expectations for code quality and enforcing these
conventions, there is an included `.jshintrc` file. Most editors support using
this to alert you of offending code in real time but, if your editor does not,
you can run the linter with:

```
npm run linter
```

Alternatively, the linter will run as part of the test suite as well, which can
be executed with:

```
npm test
```

Credits
-------

Before sending your PR, go ahead and add yourself to the `contributors` array
in the `package.json` file - you earned it :thumbsup:.

![HACK THE PLANET](http://i.giphy.com/X1OGEvUf2t58A.gif)

---

Have fun and be excellent!
