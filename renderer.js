const { ipcRenderer } = require('electron');

let profiles = [];
let selectedProfiles = new Set();

// Load profiles on startup
async function loadProfiles() {
    profiles = await ipcRenderer.invoke('get-profiles');
    renderProfiles();
}

function renderProfiles() {
    const container = document.getElementById('profilesContainer');

    if (profiles.length === 0) {
        container.innerHTML = '<div class="empty-state">No profiles yet. Create one to get started!</div>';
        return;
    }

    container.innerHTML = profiles.map((profile, index) => {
        const initial = profile.Name.charAt(0).toUpperCase();
        const avatarHtml = profile.Avatar
            ? `<img src="${profile.Avatar}" alt="${profile.Name}">`
            : initial;

        // Show Windows user indicator
        const userIndicator = profile.WindowsUser
            ? `<span class="windows-user-badge" title="Windows User: ${profile.WindowsUser}">👤</span>`
            : '';

        return `
            <div class="profile-item ${selectedProfiles.has(profile.Name) ? 'selected' : ''}"
                 onclick="toggleProfile('${profile.Name}')">
                <div class="profile-avatar">${avatarHtml}</div>
                <span class="profile-name">${profile.Name}${userIndicator}</span>
                <div class="profile-actions">
                    <button class="profile-action-btn edit-btn" onclick="event.stopPropagation(); editProfile('${profile.Name}')" title="Edit Profile">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                    <button class="profile-action-btn delete-btn" onclick="event.stopPropagation(); deleteProfile('${profile.Name}')" title="Delete Profile">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 6H5H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function toggleProfile(profileName) {
    if (selectedProfiles.has(profileName)) {
        selectedProfiles.delete(profileName);
    } else {
        selectedProfiles.add(profileName);
    }
    renderProfiles();
}

async function launchSelected() {
    if (selectedProfiles.size === 0) {
        setStatus('Please select at least one profile', 'error');
        return;
    }

    setStatus(`Launching ${selectedProfiles.size} profile(s)...`, 'loading');

    try {
        await ipcRenderer.invoke('launch-profiles', Array.from(selectedProfiles));
        setStatus(`Launched ${selectedProfiles.size} profile(s) successfully!`, 'success');
    } catch (error) {
        setStatus('Error launching profiles: ' + error.message, 'error');
    }
}

let selectedAvatar = null;

async function createProfile() {
    document.getElementById('createModal').classList.add('active');
    document.querySelector('#createModal h2').textContent = 'Create New Profile';
    document.getElementById('profileNameInput').value = '';
    document.getElementById('profilePasswordInput').value = '';
    document.getElementById('avatarPreview').innerHTML = '<span>+</span>';
    document.getElementById('rememberPassword').checked = true;
    resetPasswordStrength();
    document.getElementById('profileNameInput').focus();

    // Show the user account notice for new profiles
    const notice = document.querySelector('.user-account-notice');
    if (notice) notice.style.display = 'flex';
}

// Password visibility toggle
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    // Update icon
    button.innerHTML = isPassword
        ? `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20C5 20 1 12 1 12A18.45 18.45 0 015.06 5.06M9.9 4.24A9.12 9.12 0 0112 4C19 4 23 12 23 12A18.5 18.5 0 0119.42 17.42M1 1L23 23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
           </svg>`;
}

// Password strength indicator
function checkPasswordStrength(password) {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    return strength;
}

function updatePasswordStrength() {
    const password = document.getElementById('profilePasswordInput').value;
    const fill = document.getElementById('passwordStrengthFill');
    const text = document.getElementById('passwordStrengthText');

    if (!password) {
        fill.className = 'password-strength-fill';
        text.textContent = '';
        return;
    }

    const strength = checkPasswordStrength(password);

    if (strength <= 2) {
        fill.className = 'password-strength-fill weak';
        text.textContent = 'Weak';
    } else if (strength <= 3) {
        fill.className = 'password-strength-fill medium';
        text.textContent = 'Medium';
    } else {
        fill.className = 'password-strength-fill strong';
        text.textContent = 'Strong';
    }
}

function resetPasswordStrength() {
    const fill = document.getElementById('passwordStrengthFill');
    const text = document.getElementById('passwordStrengthText');
    if (fill) fill.className = 'password-strength-fill';
    if (text) text.textContent = '';
}

// Setup avatar upload handler once on page load
document.addEventListener('DOMContentLoaded', () => {
    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) {
        avatarInput.addEventListener('change', (e) => {
            console.log('Avatar input changed');
            const file = e.target.files[0];
            if (file) {
                console.log('File selected:', file.name, 'Size:', file.size);
                const reader = new FileReader();
                reader.onload = (event) => {
                    selectedAvatar = event.target.result;
                    console.log('Avatar loaded, length:', selectedAvatar.length);
                    document.getElementById('avatarPreview').innerHTML = `<img src="${selectedAvatar}" alt="Avatar">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // Password strength listener
    const passwordInput = document.getElementById('profilePasswordInput');
    if (passwordInput) {
        passwordInput.addEventListener('input', updatePasswordStrength);
    }
});

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('active');
    selectedAvatar = null;
    profileToEdit = null;
    resetPasswordStrength();
}

async function confirmCreateProfile() {
    const profileName = document.getElementById('profileNameInput').value.trim();
    const password = document.getElementById('profilePasswordInput').value;
    const rememberPassword = document.getElementById('rememberPassword').checked;

    if (!profileName) {
        setStatus('Please enter a profile name', 'error');
        return;
    }

    if (!password) {
        setStatus('Password is required for Windows user account', 'error');
        return;
    }

    const isEditMode = profileToEdit !== null;
    const oldName = profileToEdit;
    const avatarToSave = selectedAvatar; // Save before closeCreateModal clears it

    closeCreateModal();

    if (isEditMode) {
        // Edit mode
        setStatus('Updating profile...', 'loading');
        try {
            await ipcRenderer.invoke('update-profile', {
                oldName: oldName,
                newName: profileName,
                avatar: avatarToSave,
                password: password || undefined
            });
            await loadProfiles();
            setStatus(`Profile updated!`, 'success');
        } catch (error) {
            setStatus('Error updating profile: ' + error.message, 'error');
            console.error('Update error:', error);
        }
    } else {
        // Create mode
        setStatus('Creating profile & Windows user account...', 'loading');
        try {
            console.log('Creating profile:', profileName);
            await ipcRenderer.invoke('create-profile', {
                name: profileName,
                avatar: avatarToSave,
                password: password,
                rememberPassword: rememberPassword
            });
            await loadProfiles();
            setStatus(`Profile '${profileName}' created with Windows user account!`, 'success');
        } catch (error) {
            setStatus('Error: ' + error.message, 'error');
            console.error('Create error:', error);
        }
    }
}

let profileToDelete = null;
let profileToEdit = null;

async function editProfile(profileName) {
    const profile = profiles.find(p => p.Name === profileName);
    if (!profile) return;

    profileToEdit = profileName;
    selectedAvatar = profile.Avatar;

    document.getElementById('createModal').classList.add('active');
    document.querySelector('#createModal h2').textContent = 'Edit Profile';
    document.getElementById('profileNameInput').value = profileName;
    document.getElementById('profilePasswordInput').value = '';
    document.getElementById('profilePasswordInput').placeholder = 'Enter new password (leave blank to keep current)';

    // Hide the user account notice for editing
    const notice = document.querySelector('.user-account-notice');
    if (notice) notice.style.display = 'none';

    if (profile.Avatar) {
        document.getElementById('avatarPreview').innerHTML = `<img src="${profile.Avatar}" alt="Avatar">`;
    } else {
        document.getElementById('avatarPreview').innerHTML = '<span>+</span>';
    }

    resetPasswordStrength();
}

async function deleteProfile(profileName) {
    profileToDelete = profileName;
    document.getElementById('deleteMessage').textContent = `Are you sure you want to delete "${profileName}"? This will also delete the Windows user account associated with this profile.`;
    document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
    profileToDelete = null;
}

async function confirmDeleteProfile() {
    if (!profileToDelete) return;

    const nameToDelete = profileToDelete;
    closeDeleteModal();
    setStatus('Deleting profile & Windows user account...', 'loading');

    try {
        await ipcRenderer.invoke('delete-profile', nameToDelete);
        selectedProfiles.delete(nameToDelete);
        await loadProfiles();
        setStatus(`Profile '${nameToDelete}' deleted!`, 'success');
    } catch (error) {
        setStatus('Error deleting profile: ' + error.message, 'error');
        console.error('Delete error:', error);
    }
}

function setStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;

    if (type === 'success') {
        statusEl.style.background = 'rgba(46, 204, 113, 0.4)';
        statusEl.style.borderColor = 'rgba(46, 204, 113, 0.8)';
    } else if (type === 'error') {
        statusEl.style.background = 'rgba(231, 76, 60, 0.4)';
        statusEl.style.borderColor = 'rgba(231, 76, 60, 0.8)';
    } else {
        statusEl.style.background = 'rgba(138, 43, 226, 0.4)';
        statusEl.style.borderColor = 'rgba(138, 43, 226, 0.8)';
    }
}

function closeApp() {
    ipcRenderer.invoke('close-app');
}

function minimizeApp() {
    ipcRenderer.invoke('minimize-app');
}

// Add Enter key support for create modal
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('profileNameInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmCreateProfile();
            }
        });
    }

    const passwordInput = document.getElementById('profilePasswordInput');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmCreateProfile();
            }
        });
    }
});

// Initialize
loadProfiles();

// Initialize particles.js for twinkling stars
particlesJS('particles-js', {
    particles: {
        number: {
            value: 100,
            density: {
                enable: true,
                value_area: 800
            }
        },
        color: {
            value: '#ffffff'
        },
        shape: {
            type: 'circle'
        },
        opacity: {
            value: 0.8,
            random: true,
            anim: {
                enable: true,
                speed: 1,
                opacity_min: 0.1,
                sync: false
            }
        },
        size: {
            value: 3,
            random: true,
            anim: {
                enable: true,
                speed: 2,
                size_min: 0.1,
                sync: false
            }
        },
        line_linked: {
            enable: false
        },
        move: {
            enable: true,
            speed: 0.5,
            direction: 'none',
            random: true,
            straight: false,
            out_mode: 'out',
            bounce: false
        }
    },
    interactivity: {
        detect_on: 'canvas',
        events: {
            onhover: {
                enable: true,
                mode: 'bubble'
            },
            onclick: {
                enable: false
            },
            resize: true
        },
        modes: {
            bubble: {
                distance: 100,
                size: 6,
                duration: 2,
                opacity: 1,
                speed: 3
            }
        }
    },
    retina_detect: true
});
