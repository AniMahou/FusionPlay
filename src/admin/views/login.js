import { api } from '../api.js';

export function loginView(root, onSuccess) {
  root.innerHTML = `<div class="login"><div class="login-card">
    <span class="brand-mark">A</span>
    <div><h1>Sign in to AniMahou</h1><p>Manage events, questions and results.</p></div>
    <form novalidate>
      <label class="sr" for="email">Email</label>
      <input class="input" id="email" type="email" autocomplete="username" placeholder="Email" required>
      <label class="sr" for="password">Password</label>
      <input class="input" id="password" type="password" autocomplete="current-password" placeholder="Password" required>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-lg" type="submit">Sign in</button>
    </form>
    <a class="back" href="/">Back to the quiz</a>
  </div></div>`;
  const form = root.querySelector('form'), err = root.querySelector('.form-error');
  form.email.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true; err.textContent = '';
    try {
      await api.post('/api/admin/login', { email: form.email.value, password: form.password.value });
      await onSuccess();
    } catch (ex) {
      err.textContent = ex.message; btn.disabled = false;
      form.password.value = ''; form.password.focus();
    }
  });
}
