const API_URL = 'https://kjencmxwf0.execute-api.us-east-2.amazonaws.com/auth/auth';
let currentCredentials = null;
let currentUsername = null;
let s3Config = null;
let selectedFiles = [];
let resetUsername = '';
let currentPhotoKey = null;

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

    document.getElementById('signupUsername')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSignup();
    });
    document.getElementById('signupPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSignup();
    });

    document.getElementById('loginUsername')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    document.getElementById('loginPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    document.getElementById('resetUsername')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') requestReset();
    });

    document.getElementById('resetToken')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') resetPassword();
    });
    document.getElementById('newPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') resetPassword();
    });
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

    if (!currentUsername) {
        showMessage(messageEl, 'Session expired. Please login again.', 'error');
        return;
    }

    showMessage(messageEl, `Uploading ${selectedFiles.length} photo(s)...`, 'success');
    
    let successCount = 0;
    let failCount = 0;

    for (const file of selectedFiles) {
        try {
            const urlResponse = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'get-upload-url',
                    username: currentUsername,
                    fileName: file.name,
                    fileType: file.type
                })
            });

            if (!urlResponse.ok) {
                failCount++;
                console.error('Failed to get upload URL:', urlResponse.status);
                continue;
            }

            const urlData = await urlResponse.json();
            
            const uploadResponse = await fetch(urlData.uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type,
                },
                body: file
            });

            if (uploadResponse.ok) {
                successCount++;
            } else {
                failCount++;
                console.error('S3 Upload Failed:', uploadResponse.status, uploadResponse.statusText);
            }
        } catch (error) {
            failCount++;
            console.error('Upload Error:', error);
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

    if (!currentUsername) {
        photosListEl.innerHTML = '<p class="error">Session expired. Please login again.</p>';
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'list-photos',
                username: currentUsername
            })
        });

        if (!response.ok) {
            photosListEl.innerHTML = `<p class="error">Failed to load photos. Status: ${response.status}. Try refreshing.</p>`;
            return;
        }

        const data = await response.json();
        const photos = data.photos || [];

        let photoCount = 0;
        photosListEl.innerHTML = '';

        for (let photo of photos) {
            photoCount++;
            
            const photoDiv = document.createElement('div');
            photoDiv.className = 'photo-item';
            photoDiv.innerHTML = `
                <img src="${photo.url}" alt="${photo.fileName}" onclick="openModal('${photo.url}', '${photo.fileName}', '${photo.key}')" />
                <div class="photo-overlay">
                    <p class="photo-name">${photo.fileName}</p>
                </div>
                <button class="delete-btn" onclick="openDeleteModal('${photo.key}', event)">Delete</button>
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

function openModal(photoUrl, fileName, photoKey) {
    const modal = document.getElementById('photoModal');
    const modalImg = document.getElementById('modalImage');
    const caption = document.getElementById('modalCaption');
    const shareMessage = document.getElementById('shareMessage');
    
    modal.style.display = 'block';
    modalImg.src = photoUrl;
    caption.textContent = fileName;
    currentPhotoKey = photoKey;
    
    if (shareMessage) {
        shareMessage.classList.remove('show');
        shareMessage.textContent = '';
    }
}

function closeModal() {
    document.getElementById('photoModal').style.display = 'none';
    currentPhotoKey = null;
}

async function sharePhoto() {
    const shareMessage = document.getElementById('shareMessage');
    
    if (!currentPhotoKey) {
        shareMessage.textContent = 'Error: No photo selected';
        shareMessage.classList.add('show');
        setTimeout(() => shareMessage.classList.remove('show'), 3000);
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get-share-url',
                username: currentUsername,
                fileName: currentPhotoKey
            })
        });

        if (!response.ok) {
            throw new Error('Failed to generate share link');
        }

        const data = await response.json();
        
        const base64Url = btoa(data.shareUrl);
        const longViewerUrl = `https://photosnap.pro/viewer.html?u=${base64Url}`;
        
        const shortResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create-short-url',
                longUrl: longViewerUrl
            })
        });
        
        if (!shortResponse.ok) {
            throw new Error('Failed to create short URL');
        }
        
        const shortData = await shortResponse.json();
        const shareUrl = shortData.shortUrl;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Photo from PhotoSnap',
                    text: 'Check out this photo!',
                    url: shareUrl
                });
                shareMessage.textContent = `✓ Shared! Valid for ${data.expiresIn}`;
                shareMessage.classList.add('show');
                setTimeout(() => shareMessage.classList.remove('show'), 3000);
                return;
            } catch (shareError) {
                if (shareError.name === 'AbortError') {
                    return;
                }
            }
        }
        
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                shareMessage.textContent = `✓ Link copied! Valid for ${data.expiresIn}`;
                shareMessage.classList.add('show');
                setTimeout(() => shareMessage.classList.remove('show'), 4000);
                return;
            }
            
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                shareMessage.textContent = `✓ Link copied! Valid for ${data.expiresIn}`;
                shareMessage.classList.add('show');
                setTimeout(() => shareMessage.classList.remove('show'), 4000);
                return;
            }
        } catch (clipboardError) {
            console.error('Clipboard error:', clipboardError);
        }
        
        shareMessage.innerHTML = `<div style="word-break: break-all; font-size: 11px; max-height: 80px; overflow-y: auto; line-height: 1.3;">Tap to select, then copy:<br><input type="text" value="${shareUrl}" readonly style="width:100%; font-size:10px; padding:5px;" onclick="this.select()"></div>`;
        shareMessage.classList.add('show');
        setTimeout(() => shareMessage.classList.remove('show'), 15000);
        
    } catch (error) {
        console.error('Share error:', error);
        shareMessage.textContent = 'Error: ' + error.message;
        shareMessage.classList.add('show');
        setTimeout(() => shareMessage.classList.remove('show'), 5000);
    }
}

async function deletePhoto(key) {
    try {
        const urlResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get-delete-url',
                username: currentUsername,
                fileName: key
            })
        });

        if (!urlResponse.ok) {
            console.error('Failed to get delete URL:', urlResponse.status);
            showMessage(document.getElementById('uploadMessage'), 'Delete failed. Could not get authorization.', 'error');
            return;
        }

        const urlData = await urlResponse.json();
        
        const response = await fetch(urlData.deleteUrl, {
            method: 'DELETE'
        });

        if (response.ok || response.status === 204) {
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
    currentPhotoKey = null;
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