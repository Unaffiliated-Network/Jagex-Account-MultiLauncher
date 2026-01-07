const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const sudo = require('sudo-prompt');

const PROFILES_PATH = 'C:\\JagexProfiles';
const CONFIG_PATH = path.join(PROFILES_PATH, 'profiles.json');
const JAGEX_LAUNCHER = 'C:\\Program Files (x86)\\Jagex Launcher\\JagexLauncher.exe';

// Encryption key derived from machine-specific data
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.COMPUTERNAME + process.env.USERNAME).digest();

// Ensure profiles directory exists
if (!fs.existsSync(PROFILES_PATH)) {
    fs.mkdirSync(PROFILES_PATH, { recursive: true });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 600,
        height: 750,
        title: 'Jagex Multi-Launcher',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        transparent: true,
        resizable: false,
        icon: path.join(__dirname, 'icon.ico')
    });

    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Password encryption/decryption using AES-256
function encryptPassword(password) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptPassword(encryptedData) {
    try {
        const parts = encryptedData.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('Decryption failed:', e);
        return null;
    }
}

// Check if Windows user exists
function userExists(username) {
    try {
        execSync(`net user "${username}"`, { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

// Create Windows user account with elevation using sudo-prompt
function createWindowsUser(username, password) {
    return new Promise((resolve, reject) => {
        // Sanitize username - Windows usernames have restrictions
        const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20);

        if (userExists(safeUsername)) {
            resolve({ success: true, username: safeUsername, existed: true });
            return;
        }

        // Escape special characters for command line
        const escapedPassword = password.replace(/"/g, '\\"');

        const command = `net user "${safeUsername}" "${escapedPassword}" /add /comment:"Jagex Multi-Launcher Profile"`;

        const options = {
            name: 'Jagex Multi Launcher'
        };

        sudo.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                console.error('User creation error:', error);
                reject(new Error('Failed to create user. Please approve the UAC prompt.'));
                return;
            }
            console.log('User created successfully:', safeUsername);
            resolve({ success: true, username: safeUsername, existed: false });
        });
    });
}

// Delete Windows user account with elevation using sudo-prompt
function deleteWindowsUser(username) {
    return new Promise((resolve, reject) => {
        const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20);

        if (!userExists(safeUsername)) {
            resolve({ success: true, existed: false });
            return;
        }

        const command = `net user "${safeUsername}" /delete`;

        const options = {
            name: 'Jagex Multi Launcher'
        };

        sudo.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                console.error('User deletion error:', error);
                resolve({ success: false, error: 'User may not have been deleted' });
                return;
            }
            console.log('User deleted successfully:', safeUsername);
            resolve({ success: true, existed: true });
        });
    });
}

// IPC Handlers
ipcMain.handle('get-profiles', () => {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const profiles = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            // Don't send encrypted passwords to renderer
            return profiles.map(p => ({
                Name: p.Name,
                Avatar: p.Avatar,
                WindowsUser: p.WindowsUser,
                HasPassword: !!p.EncryptedPassword
            }));
        }
    } catch (e) { }
    return [];
});

ipcMain.handle('create-profile', async (event, profileData) => {
    console.log('create-profile called with:', profileData.name);
    let profiles = [];

    const profileName = profileData.name;
    const profileAvatar = profileData.avatar || null;
    const password = profileData.password;
    const rememberPassword = profileData.rememberPassword !== false;

    if (!password || password.length < 1) {
        throw new Error('Password is required for Windows user account');
    }

    // Load existing profiles
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            const parsed = JSON.parse(data);
            profiles = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('Error reading profiles:', e);
            profiles = [];
        }
    }

    // Check if profile name already exists
    if (profiles.some(p => p.Name.toLowerCase() === profileName.toLowerCase())) {
        throw new Error('A profile with this name already exists');
    }

    // Create Windows user account
    let windowsUser;
    try {
        const result = await createWindowsUser(profileName, password);
        windowsUser = result.username;
        console.log('Windows user result:', result);
    } catch (e) {
        console.error('Failed to create Windows user:', e);
        throw new Error(`Failed to create Windows user account: ${e.message}`);
    }

    // Create profile data
    const newProfile = {
        Name: profileName,
        Avatar: profileAvatar,
        WindowsUser: windowsUser,
        EncryptedPassword: rememberPassword ? encryptPassword(password) : null,
        CreatedAt: new Date().toISOString()
    };

    profiles.push(newProfile);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(profiles, null, 2));
    console.log('Profile saved successfully');
    return true;
});

ipcMain.handle('delete-profile', async (event, profileName) => {
    let profiles = [];

    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            const parsed = JSON.parse(data);
            profiles = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            profiles = [];
        }
    }

    // Find the profile to get Windows username
    const profileToDelete = profiles.find(p => p.Name === profileName);

    if (profileToDelete && profileToDelete.WindowsUser) {
        // Delete Windows user account
        try {
            await deleteWindowsUser(profileToDelete.WindowsUser);
        } catch (e) {
            console.error('Error deleting Windows user:', e);
        }
    }

    profiles = profiles.filter(p => p.Name !== profileName);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(profiles, null, 2));

    return true;
});

ipcMain.handle('update-profile', async (event, updateData) => {
    let profiles = [];

    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            const parsed = JSON.parse(data);
            profiles = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('Error reading profiles:', e);
            profiles = [];
        }
    }

    // Find and update the profile
    const profileIndex = profiles.findIndex(p => p.Name === updateData.oldName);
    if (profileIndex !== -1) {
        profiles[profileIndex].Name = updateData.newName;
        profiles[profileIndex].Avatar = updateData.avatar;

        // Update password if provided
        if (updateData.password) {
            profiles[profileIndex].EncryptedPassword = encryptPassword(updateData.password);
        }

        fs.writeFileSync(CONFIG_PATH, JSON.stringify(profiles, null, 2));
        return true;
    }
    return false;
});

ipcMain.handle('launch-profiles', async (event, profileNames) => {
    let profiles = [];

    if (fs.existsSync(CONFIG_PATH)) {
        try {
            profiles = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        } catch (e) {
            console.error('Error reading profiles:', e);
            return false;
        }
    }

    for (const profileName of profileNames) {
        const profile = profiles.find(p => p.Name === profileName);

        if (!profile) {
            console.error(`Profile not found: ${profileName}`);
            continue;
        }

        if (!profile.WindowsUser || !profile.EncryptedPassword) {
            console.error(`Profile ${profileName} missing Windows user or password`);
            continue;
        }

        const password = decryptPassword(profile.EncryptedPassword);
        if (!password) {
            console.error(`Failed to decrypt password for ${profileName}`);
            continue;
        }

        // Use PowerShell to create a proper logon session and launch the app
        // This approach creates a new process with proper credentials
        console.log(`Launching profile ${profileName} as user ${profile.WindowsUser}...`);

        // Create a temporary VBScript that will type the password automatically
        const vbsPath = path.join(PROFILES_PATH, `launch_${profile.WindowsUser}.vbs`);
        const computerName = process.env.COMPUTERNAME;

        // VBScript that launches runas and auto-types the password
        const vbsContent = `
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "runas /user:${computerName}\\${profile.WindowsUser} ""${JAGEX_LAUNCHER}""", 1, False
WScript.Sleep 500
WshShell.SendKeys "${password.replace(/[+^%~()[\]{}]/g, '{$&}')}~"
        `.trim();

        try {
            fs.writeFileSync(vbsPath, vbsContent);

            exec(`cscript //nologo "${vbsPath}"`, (error, stdout, stderr) => {
                // Clean up the VBS file after a delay
                setTimeout(() => {
                    try { fs.unlinkSync(vbsPath); } catch (e) { }
                }, 5000);

                if (error) {
                    console.error(`Error launching profile ${profileName}:`, error.message);
                } else {
                    console.log(`Launched profile ${profileName} successfully`);
                }
            });
        } catch (e) {
            console.error('Failed to create launch script:', e);
        }

        // Wait between launches to avoid issues
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    return true;
});

ipcMain.handle('check-admin', () => {
    try {
        // Try to access a file that requires admin privileges
        execSync('net session', { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('close-app', () => {
    app.quit();
});

ipcMain.handle('minimize-app', () => {
    BrowserWindow.getFocusedWindow()?.minimize();
});
