import { auth } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    updateProfile
} from 'firebase/auth';

document.addEventListener('DOMContentLoaded', () => {

    // --- Route Guarding ---
    // If user is already logged in, redirect them away from the login page to the app
    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.location.href = './index.html';
        }
    });

    // --- UI Elements ---
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const formLogin = document.getElementById('form-login');
    const formSignup = document.getElementById('form-signup');
    const alertBox = document.getElementById('auth-alert');
    const alertIcon = document.getElementById('auth-alert-icon');
    const alertText = document.getElementById('auth-alert-text');

    // --- Tab Switching ---
    if (tabLogin && tabSignup) {
        tabLogin.addEventListener('click', () => {
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            formLogin.classList.add('active');
            formSignup.classList.remove('active');
            hideAlert();
        });

        tabSignup.addEventListener('click', () => {
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            formSignup.classList.add('active');
            formLogin.classList.remove('active');
            hideAlert();
        });
    }

    // --- Password Visibility Toggle ---
    const toggleBtns = document.querySelectorAll('.btn-toggle-password');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const icon = btn.querySelector('.material-symbols-outlined');

            if (input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility_off';
            } else {
                input.type = 'password';
                icon.textContent = 'visibility';
            }
        });
    });

    // --- Alert Helper ---
    function showAlert(message, type = 'error') {
        alertBox.className = `auth-alert ${type}`;
        alertText.textContent = message;
        alertIcon.textContent = type === 'error' ? 'error' : 'check_circle';
        alertBox.style.display = 'flex';
    }

    function hideAlert() {
        alertBox.style.display = 'none';
    }

    // --- Sign Up Logic ---
    if (formSignup) {
        formSignup.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlert();

            const name = document.getElementById('signup-name').value;
            const email = document.getElementById('signup-email').value;
            const password = document.getElementById('signup-password').value;

            const btnText = document.getElementById('signup-btn-text');
            const spinner = document.getElementById('signup-spinner');

            // Set loading state
            btnText.style.display = 'none';
            spinner.style.display = 'inline-block';
            document.getElementById('btn-signup-submit').disabled = true;

            try {
                // Create user
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);

                // Update profile with name
                await updateProfile(userCredential.user, {
                    displayName: name
                });

                // onAuthStateChanged will redirect automatically
            } catch (error) {
                console.error("Signup error:", error);
                let msg = "Failed to create account.";
                if (error.code === 'auth/email-already-in-use') msg = "That email is already in use.";
                if (error.code === 'auth/weak-password') msg = "Password should be at least 6 characters.";
                if (error.code === 'auth/invalid-email') msg = "Invalid email address.";

                showAlert(msg, 'error');

                // Restore button state
                btnText.style.display = 'inline-block';
                spinner.style.display = 'none';
                document.getElementById('btn-signup-submit').disabled = false;
            }
        });
    }

    // --- Login Logic ---
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlert();

            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            const btnText = document.getElementById('login-btn-text');
            const spinner = document.getElementById('login-spinner');

            // Set loading state
            btnText.style.display = 'none';
            spinner.style.display = 'inline-block';
            document.getElementById('btn-login-submit').disabled = true;

            try {
                await signInWithEmailAndPassword(auth, email, password);
                // onAuthStateChanged will handle redirect
            } catch (error) {
                console.error("Login error:", error);

                showAlert('Invalid email or password.', 'error');

                // Restore button state
                btnText.style.display = 'inline-block';
                spinner.style.display = 'none';
                document.getElementById('btn-login-submit').disabled = false;
            }
        });
    }
});
