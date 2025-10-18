import { Component } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, createUserWithEmailAndPassword, updateProfile } from '@angular/fire/auth';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-createaccount',
  templateUrl: './createaccount.page.html',
  styleUrls: ['./createaccount.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class CreateaccountPage {
  name = '';
  email = '';
  phone = '';
  password = '';

  // UI
  showPassword = false;

  // Validación / estado
  nameTouched = false;
  emailTouched = false;
  phoneTouched = false;
  passwordTouched = false;
  attemptedSubmit = false;

  nameError: string | null = null;
  emailError: string | null = null;
  phoneError: string | null = null;
  passwordError: string | null = null;

  // Debounces
  private nameDebounce?: any;
  private emailDebounce?: any;
  private phoneDebounce?: any;
  private passwordDebounce?: any;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  /** Limpia campos y estado (igual que en Login) */
  private resetForm() {
    this.name = '';
    this.email = '';
    this.phone = '';
    this.password = '';
    this.showPassword = false;

    this.nameTouched = false;
    this.emailTouched = false;
    this.phoneTouched = false;
    this.passwordTouched = false;
    this.attemptedSubmit = false;

    this.nameError = null;
    this.emailError = null;
    this.phoneError = null;
    this.passwordError = null;

    clearTimeout(this.nameDebounce);
    clearTimeout(this.emailDebounce);
    clearTimeout(this.phoneDebounce);
    clearTimeout(this.passwordDebounce);
  }

  ionViewWillEnter() { this.resetForm(); }
  ionViewDidLeave()  { this.resetForm(); }

  // ===== Validaciones =====
  private validateName(): string | null {
    if (!this.name) return 'Ingresa tu nombre.';
    if (this.name.trim().length < 2) return 'Nombre muy corto.';
    return null;
  }

  private validateEmail(): string | null {
    if (!this.email) return 'Ingresa tu correo.';
    if (!this.email.includes('@')) return 'Debe incluir “@”.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) return 'Correo inválido.';
    return null;
  }

  private validatePhone(): string | null {
    if (!this.phone) return 'Ingresa tu teléfono.';
    const digits = this.phone.replace(/\s+/g, '');
    if (!/^\+?\d{9,12}$/.test(digits)) return 'Sólo números (9–12 dígitos).';
    return null;
  }

  private validatePassword(): string | null {
    if (!this.password) return 'Ingresa tu contraseña.';
    if (this.password.length < 6) return 'Mínimo 6 caracteres.';
    return null;
  }

  updateNameError()     { this.nameError = this.validateName(); }
  updateEmailError()    { this.emailError = this.validateEmail(); }
  updatePhoneError()    { this.phoneError = this.validatePhone(); }
  updatePasswordError() { this.passwordError = this.validatePassword(); }

  onNameInput() {
    clearTimeout(this.nameDebounce);
    this.nameDebounce = setTimeout(() => {
      if (this.nameTouched || this.attemptedSubmit) this.updateNameError();
    }, 160);
  }
  onEmailInput() {
    clearTimeout(this.emailDebounce);
    this.emailDebounce = setTimeout(() => {
      if (this.emailTouched || this.attemptedSubmit) this.updateEmailError();
    }, 160);
  }
  onPhoneInput() {
    clearTimeout(this.phoneDebounce);
    this.phoneDebounce = setTimeout(() => {
      if (this.phoneTouched || this.attemptedSubmit) this.updatePhoneError();
    }, 160);
  }
  onPasswordInput() {
    clearTimeout(this.passwordDebounce);
    this.passwordDebounce = setTimeout(() => {
      if (this.passwordTouched || this.attemptedSubmit) this.updatePasswordError();
    }, 160);
  }

  togglePasswordVisibility() { this.showPassword = !this.showPassword; }

  // ===== Registro =====
  async register() {
    this.attemptedSubmit = true;
    this.updateNameError();
    this.updateEmailError();
    this.updatePhoneError();
    this.updatePasswordError();

    if (this.nameError || this.emailError || this.phoneError || this.passwordError) {
      return; // No continuar si hay errores
    }

    try {
      const userCred = await createUserWithEmailAndPassword(this.auth, this.email, this.password);
      const uid = userCred.user.uid;

      // Nombre visible en Auth (opcional)
      try { await updateProfile(userCred.user, { displayName: this.name }); }
      catch (e) { console.warn('No se pudo actualizar el perfil:', e); }

      // Rol simple por dominio (igual a tu lógica actual)
      const role = this.email === 'admin@petprice.com' ? 'admin' : 'user';

      const userRef = doc(this.firestore, `users/${uid}`);
      await setDoc(userRef, {
        uid,
        fullName: this.name,
        email: this.email,
        phone: this.phone,
        createdAt: new Date().toISOString(),
        role,
      });

      this.showToast('Cuenta creada con éxito');
      this.router.navigate(['/login']);
    } catch (err: any) {
      console.error('Error al registrar usuario:', err);
      const code = err?.code as string | undefined;

      // Feedback por campo según código
      switch (code) {
        case 'auth/email-already-in-use':
          this.emailTouched = true;
          this.emailError = 'Este correo ya está registrado';
          break;
        case 'auth/invalid-email':
          this.emailTouched = true;
          this.emailError = 'El correo no es válido';
          break;
        case 'auth/weak-password':
          this.passwordTouched = true;
          this.passwordError = 'La contraseña debe tener al menos 6 caracteres';
          break;
        default:
          this.showToast('Ocurrió un error inesperado');
      }
    }
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color: 'primary',
    });
    await toast.present();
  }

  goToLogin(){ this.router.navigate(['/login']); }
}
