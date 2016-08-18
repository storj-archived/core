### Prerequisites

* Node.js LTS (v4.x.x)
* Python 2.7
* Git 2.x.x

### Installing on GNU/Linux & Mac OSX

Install Node.js and it's package manager NPM using Node Version Manager:

```
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
```

> Detailed NVM installation instructions can be found [here](https://github.com/creationix/nvm#install-script).

After NVM is installed, source your `~/.bashrc`, `~/.profile`, or `~/.zshrc`
depending on your shell of choice:

```
source ~/.zshrc
```

Now that you can call the `nvm` program, install Node.js (which comes with NPM):

```
nvm install 4.4.4
```

> You'll also need to make sure you have a C++ compiler installed before
> proceeding to the next step. Debian based distributions can install the
> `build-essential` package using APT and Mac OSX users can install with
> `xcode-select --install` and follow the wizard.

### Installing on Windows (Manual)

Download [Node.js LTS](https://nodejs.org/en/download/) for Windows, launch the
installer and follow the setup instructions. Restart your PC, then test it from
the command prompt:

```
node --version
npm --version
```

Install the [latest version of Python 2.7](https://www.python.org/ftp/python/2.7.11/python-2.7.11.amd64.msi),
launch the installer and follow the instructions. To use Python from the shell
and add it to the system you have to add the path in "System Variables":

Navigate to:

```
Control Panel > System > Advanced System Settings > Environment Variables > System Variables > Path > Edit
```

Then add `;C:\Python27` or the installation path and test it in the command
prompt by running:

```
python -V
```

Next, install [Git](https://git-for-windows.github.io/) for your Windows
version. Then, install [Visual Studio Community 2015](https://www.visualstudio.com/)
and during the setup choose `Custom Installation > Programming Languages` and
select **Visual C++** and **Common Tools for Visual C++**.

Finally, set the new environment variable in the Windows command prompt with:

````
setx GYP_MSVS_VERSION 2015
```

### Installing on Windows (Automated)

Install utilizing automated script

<a href="https://github.com/Storj/storj-automation/archive/master.zip">https://github.com/Storj/storj-automation/archive/master.zip</a>

Run the `install.bat` located in `/Windows/storj-automate`
