const API_URL = 'https://kjencmxwf0.execute-api.us-east-2.amazonaws.com/auth/auth';
let currentCredentials = null;
let currentUsername = null;
let s3Config = null;
let selectedFiles = [];
let resetUsername = '';

// Tab switching
function showSignup() {
    document.getElementById('signupForm').style.display = 'flex';
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'none';
    document.querySelectorAll('.tab')[0].classList.add('active');
    document.querySelectorAll('.tab')[1].classList.remove('active');
}

function showLogin() {
    document.getElementById('loginForm').style.display = 'flex';
    document.getElementById('signupForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'none';
    document.querySelectorAll('.tab')[1].classList.add('active');
    document.querySelectorAll('.tab')[0].classList.remove('active');
}

function showForgotPassword() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signupForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'flex';
    document.getElementById('resetPasswordForm').style.display = 'none';
}

// Handle Signup
async function handleSignup() {
    const username = document.getElementById('signupUsername').value.trim();
    const password = document.getElementById('signupPassword').value;
    const messageEl = document.getElementById('signupMessage');

    if (!username || !password) {
        showMessage(messageEl, 'Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'signup',
                username,
                password
            })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(messageEl, 'Account created! Please login.', 'success');
            document.getElementById('signupUsername').value = '';
            document.getElementById('signupPassword').value = '';
            setTimeout(showLogin, 2000);
        } else {
            showMessage(messageEl, data.error || 'Signup failed', 'error');
        }
    } catch (error) {
        showMessage(messageEl, 'Network error: ' + error.message, 'error');
    }
}

// Handle Login
async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const messageEl = document.getElementById('loginMessage');

    if (!username || !password) {
        showMessage(messageEl, 'Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'login',
                username,
                password
            })
        });

        const data = await response.json();

        if (response.ok) {
            currentCredentials = data.credentials;
            currentUsername = username;
            s3Config = data.s3Config;
            
            showMessage(messageEl, 'Login successful!', 'success');
            setTimeout(() => {
                document.getElementById('authSection').style.display = 'none';
                document.getElementById('photoSection').style.display = 'block';
                document.getElementById('currentUser').textContent = username;
                loadPhotos();
            }, 1000);
        } else {
            showMessage(messageEl, data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showMessage(messageEl, 'Network error: ' + error.message, 'error');
    }
}

// Request Password Reset
async function requestReset() {
    const username = document.getElementById('resetUsername').value.trim();
    const messageEl = document.getElementById('resetRequestMessage');

    if (!username) {
        showMessage(messageEl, 'Please enter your username', 'error');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'request-reset',
                username
            })
        });

        const data = await response.json();

        if (response.ok) {
            resetUsername = username;
            showMessage(messageEl, 'Reset code generated! Check below.', 'success');
            
            setTimeout(() => {
                document.getElementById('forgotPasswordForm').style.display = 'none';
                document.getElementById('resetPasswordForm').style.display = 'flex';
                
                const tokenDisplay = document.createElement('div');
                tokenDisplay.className = 'token-display';
                tokenDisplay.innerHTML = `
                    <p class="token-label">Your Reset Code (valid for 15 minutes):</p>
                    <p class="token-value">${data.resetToken}</p>
                `;
                document.getElementById('resetPasswordForm').insertBefore(
                    tokenDisplay, 
                    document.getElementById('resetToken')
                );
            }, 1500);
        } else {
            showMessage(messageEl, data.error || 'Failed to generate reset code', 'error');
        }
    } catch (error) {
        showMessage(messageEl, 'Network error: ' + error.message, 'error');
    }
}

// Reset Password with Token
async function resetPassword() {
    const token = document.getElementById('resetToken').value.trim();
    const newPassword = document.getElementById('newPassword').value;
    const messageEl = document.getElementById('resetPasswordMessage');

    if (!token || !newPassword) {
        showMessage(messageEl, 'Please fill in all fields', 'error');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'reset-password',
                username: resetUsername,
                resetToken: token,
                newPassword
            })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(messageEl, 'Password reset successful! Redirecting to login...', 'success');
            setTimeout(() => {
                document.getElementById('resetToken').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('resetUsername').value = '';
                resetUsername = '';
                
                const tokenDisplay = document.querySelector('.token-display');
                if (tokenDisplay) tokenDisplay.remove();
                
                showLogin();
            }, 2000);
        } else {
            showMessage(messageEl, data.error || 'Password reset failed', 'error');
        }
    } catch (error) {
        showMessage(messageEl, 'Network error: ' + error.message, 'error');
    }
}

// File input change handler
document.addEventListener('DOMContentLoaded', function() {
    const photoInput = document.getElementById('photoInput');
    const uploadArea = document.getElementById('uploadArea');
    
    if (photoInput) {
        photoInput.addEventListener('change', handleFileSelect);
    }
    
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.background = '#f0f4ff';
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.background = '';
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.background = '';
            const files = Array.from(e.dataTransfer.files);
            handleFiles(files);
        });
    }
});

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    handleFiles(files);
}

function handleFiles(files) {
    selectedFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (selectedFiles.length === 0) {
        showMessage(document.getElementById('uploadMessage'), 'Please select image files', 'error');
        return;
    }
    
    displayPreview();
    document.getElementById('uploadBtn').style.display = 'block';
}

function displayPreview() {
    const previewContainer = document.getElementById('uploadPreview');
    previewContainer.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <img src="${e.target.result}" alt="${file.name}" />
                <button class="remove-preview" onclick="removePreview(${index})">✕</button>
            `;
            previewContainer.appendChild(previewItem);
        };
        reader.readAsDataURL(file);
    });
}

function removePreview(index) {
    selectedFiles.splice(index, 1);
    if (selectedFiles.length === 0) {
        document.getElementById('uploadPreview').innerHTML = '';
        document.getElementById('uploadBtn').style.display = 'none';
        document.getElementById('photoInput').value = '';
    } else {
        displayPreview();
    }
}

async function uploadPhotos() {
    const messageEl = document.getElementById('uploadMessage');
    
    if (selectedFiles.length === 0) {
        showMessage(messageEl, 'Please select photos', 'error');
        return;
    }

    if (!currentCredentials) {
        showMessage(messageEl, 'Session expired. Please login again.', 'error');
        return;
    }

    showMessage(messageEl, `Uploading ${selectedFiles.length} photo(s)...`, 'success');
    
    let successCount = 0;
    let failCount = 0;

    for (const file of selectedFiles) {
        try {
            const timestamp = Date.now();
            const fileName = `${timestamp}-${file.name}`;
            const s3Url = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${s3Config.folder}${fileName}`;
            
            const response = await fetch(s3Url, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type,
                },
                body: file
            });

            if (response.ok) {
                successCount++;
            } else {
                failCount++;
                console.error('S3 Upload Failed:', response.status, response.statusText);
            }
        } catch (error) {
            failCount++;
            console.error('S3 Upload Error:', error);
        }
    }

    if (successCount > 0) {
        showMessage(messageEl, `Successfully uploaded ${successCount} photo(s)!`, 'success');
        document.getElementById('uploadPreview').innerHTML = '';
        document.getElementById('uploadBtn').style.display = 'none';
        document.getElementById('photoInput').value = '';
        selectedFiles = [];
        setTimeout(loadPhotos, 1000);
    } else {
        showMessage(messageEl, `Upload failed for ${failCount} photo(s)`, 'error');
    }
}

async function loadPhotos() {
    const photosListEl = document.getElementById('photosList');
    photosListEl.innerHTML = '<p>Loading photos...</p>';

    if (!currentCredentials) {
        photosListEl.innerHTML = '<p class="error">Session expired. Please login again.</p>';
        return;
    }

    try {
        const listUrl = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/?list-type=2&prefix=${s3Config.folder}`;
        
        const response = await fetch(listUrl, {
            headers: {
                'Authorization': `AWS4-HMAC-SHA256 Credential=${currentCredentials.accessKeyId}`,
                'x-amz-security-token': currentCredentials.sessionToken
            }
        });

        if (!response.ok) {
            photosListEl.innerHTML = `<p class="error">Failed to load photos. Status: ${response.status}. Try refreshing.</p>`;
            return;
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const contents = xmlDoc.getElementsByTagName('Contents');

        let photoCount = 0;
        photosListEl.innerHTML = '';

        for (let item of contents) {
            const key = item.getElementsByTagName('Key')[0].textContent;
            if (key.endsWith('/')) continue;

            photoCount++;
            const fileName = key.split('/').pop();
            const photoUrl = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;
            
            const photoDiv = document.createElement('div');
            photoDiv.className = 'photo-item';
            photoDiv.innerHTML = `
                <img src="${photoUrl}" alt="${fileName}" onclick="openModal('${photoUrl}', '${fileName}')" />
                <div class="photo-overlay">
                    <p class="photo-name">${fileName}</p>
                </div>
                <button class="delete-btn" onclick="openDeleteModal('${key}', event)">Delete</button>
            `;
            photosListEl.appendChild(photoDiv);
        }

        document.getElementById('photoCount').textContent = photoCount;

        if (photoCount === 0) {
            photosListEl.innerHTML = '<p style="text-align:center; color:#999; padding:40px;">No photos yet. Upload your first photo!</p>';
        }
    } catch (error) {
        photosListEl.innerHTML = '<p class="error">Error loading photos: ' + error.message + '</p>';
    }
}

function openDeleteModal(key, event) {
    event.stopPropagation();
    
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
        <div class="modal-content-custom">
            <p>Delete this photo permanently?</p>
            <div class="modal-actions">
                <button class="btn btn-primary" id="confirmDelete">Yes, Delete</button>
                <button class="btn btn-secondary" id="cancelDelete">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);

    document.getElementById('confirmDelete').onclick = () => {
        deletePhoto(key);
        document.body.removeChild(modal);
    };

    document.getElementById('cancelDelete').onclick = () => {
        document.body.removeChild(modal);
    };
}

function openModal(photoUrl, fileName) {
    const modal = document.getElementById('photoModal');
    const modalImg = document.getElementById('modalImage');
    const caption = document.getElementById('modalCaption');
    
    modal.style.display = 'block';
    modalImg.src = photoUrl;
    caption.textContent = fileName;
}

function closeModal() {
    document.getElementById('photoModal').style.display = 'none';
}

async function deletePhoto(key) {
    try {
        const deleteUrl = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/${key}`;
        
        const response = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {}
        });

        if (response.ok) {
            showMessage(document.getElementById('uploadMessage'), 'Photo deleted successfully', 'success');
            setTimeout(() => {
                showMessage(document.getElementById('uploadMessage'), '', '');
                loadPhotos();
            }, 1500);
        } else {
            console.error('Delete failed:', response.status, response.statusText);
            showMessage(document.getElementById('uploadMessage'), 'Delete failed. Check console for error.', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showMessage(document.getElementById('uploadMessage'), 'Delete error: ' + error.message, 'error');
    }
}

function logout() {
    currentCredentials = null;
    currentUsername = null;
    s3Config = null;
    selectedFiles = [];
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('photoSection').style.display = 'none';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('uploadPreview').innerHTML = '';
    document.getElementById('uploadBtn').style.display = 'none';
    document.getElementById('photosList').innerHTML = '<p>No photos loaded.</p>';
}

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message ${type}`;
}