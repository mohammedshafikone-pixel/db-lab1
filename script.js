const registerForm = document.getElementById('registerForm');

if (registerForm) {
    registerForm.addEventListener('submit', function (event) {
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword =
            document.getElementById('confirm_password').value;

        const errors = [];

        if (!name.trim()) {
            errors.push('Name is required');
        }

        if (!email.trim()) {
            errors.push('Email is required');
        }

        if (!password) {
            errors.push('Password is required');
        }

        if (!confirmPassword) {
            errors.push('Confirm password is required');
        } else if (password !== confirmPassword) {
            errors.push('Passwords do not match');
        }

        if (errors.length > 0) {
            event.preventDefault();
            alert(errors.join('\n'));
        }
    });
}

const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.addEventListener('submit', function (event) {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        const errors = [];

        if (!email.trim()) {
            errors.push('Email is required');
        }

        if (!password) {
            errors.push('Password is required');
        }

        if (errors.length > 0) {
            event.preventDefault();
            alert(errors.join('\n'));
        }
    });
}

const todoForm = document.getElementById('todoForm');

if (todoForm) {
    todoForm.addEventListener('submit', function (event) {
        const title = document.getElementById('title').value;

        if (!title.trim()) {
            event.preventDefault();
            alert('Title is required');
            return;
        }

        if (title.trim().length > 200) {
            event.preventDefault();
            alert('Title is too long');
        }
    });
}