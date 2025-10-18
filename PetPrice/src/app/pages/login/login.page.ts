import { Component } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { UserService } from 'src/app/services/User.Service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class LoginPage {
  email: string = '';
  password: string = '';

  // UI
  showPassword = false;

  // Validación / estado
  emailTouched = false;
  passwordTouched = false;
  attemptedSubmit = false;

  emailError: string | null = null;
  passwordError: string | null = null;

  // Debounce timers
  private emailDebounce?: any;
  private passwordDebounce?: any;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private userService: UserService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  /** Limpia campos y estado de validación/UI */
  private resetForm() {
    this.email = '';
    this.password = '';
    this.showPassword = false;

    this.emailTouched = false;
    this.passwordTouched = false;
    this.attemptedSubmit = false;

    this.emailError = null;
    this.passwordError = null;

    clearTimeout(this.emailDebounce);
    clearTimeout(this.passwordDebounce);
  }

  ionViewWillEnter() {
    this.resetForm();
  }

  ionViewDidLeave() {
    this.resetForm();
  }

  // ===== Validaciones =====
  private validateEmail(): string | null {
    if (!this.email) return 'Ingresa tu correo.';
    if (!this.email.includes('@')) return 'Debe incluir “@”.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) return 'Correo inválido.';
    return null;
  }

  private validatePassword(): string | null {
    if (!this.password) return 'Ingresa tu contraseña.';
    if (this.password.length < 6) return 'Mínimo 6 caracteres.';
    return null;
  }

  updateEmailError() { this.emailError = this.validateEmail(); }
  updatePasswordError() { this.passwordError = this.validatePassword(); }

  onEmailInput() {
    clearTimeout(this.emailDebounce);
    this.emailDebounce = setTimeout(() => {
      if (this.emailTouched || this.attemptedSubmit) this.updateEmailError();
    }, 160);
  }

  onPasswordInput() {
    clearTimeout(this.passwordDebounce);
    this.passwordDebounce = setTimeout(() => {
      if (this.passwordTouched || this.attemptedSubmit) this.updatePasswordError();
    }, 160);
  }

  togglePasswordVisibility() { this.showPassword = !this.showPassword; }

  // ===== Login =====
  async login() {
    this.attemptedSubmit = true;
    this.updateEmailError();
    this.updatePasswordError();

    if (this.emailError || this.passwordError) return;

    try {
      const cred = await signInWithEmailAndPassword(this.auth, this.email, this.password);
      const user = cred.user;

      const userDocRef = doc(this.firestore, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      // 🔒 Verificar si el documento del usuario existe en Firestore
      if (!userDoc.exists()) {
        // El documento fue eliminado: cerramos sesión y bloqueamos acceso
        await signOut(this.auth);
        this.showToast('Tu cuenta ha sido eliminada o deshabilitada.');
        return;
      }

      // Si existe, se permite el acceso normalmente
      this.userService.updateCurrentUser(user);
      const role = (userDoc.data() as any)['role'] || 'user';

      this.showToast('Inicio de sesión exitoso');
      this.router.navigate([role === 'admin' ? '/admin-panel' : '/profile']);
    } catch (err: any) {
      console.error(err);
      const code = err?.code as string | undefined;

      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        this.passwordTouched = true;
        this.passwordError = 'Contraseña inválida.';
        return;
      }

      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        this.emailTouched = true;
        this.emailError = code === 'auth/invalid-email' ? 'Correo inválido.' : 'Usuario no encontrado.';
        return;
      }

      if (code === 'auth/too-many-requests') {
        this.passwordTouched = true;
        this.passwordError = 'Demasiados intentos. Intenta más tarde.';
        return;
      }

      this.showToast(err.message || 'Error al iniciar sesión.');
    }
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color: 'primary'
    });
    await toast.present();
  }

  goToChangePassword() {
    this.router.navigate(['/changepassword'], { queryParams: { email: this.email || '' } });
  }

  goToCreateAccount() { this.router.navigate(['/createaccount']); }
  goToProducts() { this.router.navigate(['/products']); }
}
