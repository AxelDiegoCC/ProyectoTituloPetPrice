import { Component } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth, sendPasswordResetEmail } from '@angular/fire/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-changepassword',
  templateUrl: './changepassword.page.html',
  styleUrls: ['./changepassword.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ChangepasswordPage {
  email: string = '';
  step: number = 1; // 1: pedir correo, 2: confirmación

  // Validación / estado
  emailTouched = false;
  attemptedSubmit = false;
  emailError: string | null = null;

  // Debounce
  private emailDebounce?: any;

  constructor(
    private auth: Auth,
    private toastCtrl: ToastController,
    public router: Router
  ) {}

  /** Limpia campos y estado (igual que en Login) */
  private resetForm() {
    this.email = '';
    this.step = 1;

    this.emailTouched = false;
    this.attemptedSubmit = false;
    this.emailError = null;

    clearTimeout(this.emailDebounce);
  }

  /** Cada vez que entras, deja la vista limpia */
  ionViewWillEnter() {
    this.resetForm();
  }

  /** Al salir, limpia también (por si vuelves atrás) */
  ionViewDidLeave() {
    this.resetForm();
  }

  // ===== Validación =====
  private validateEmail(): string | null {
    if (!this.email) return 'Ingresa tu correo.';
    if (!this.email.includes('@')) return 'Debe incluir “@”.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) return 'Correo inválido.';
    return null;
  }

  updateEmailError() {
    this.emailError = this.validateEmail();
  }

  onEmailInput() {
    clearTimeout(this.emailDebounce);
    this.emailDebounce = setTimeout(() => {
      if (this.emailTouched || this.attemptedSubmit) this.updateEmailError();
    }, 160);
  }

  // ===== Envío =====
  async sendResetEmail() {
    this.attemptedSubmit = true;
    this.updateEmailError();

    if (this.emailError) return;

    try {
      await sendPasswordResetEmail(this.auth, this.email);
      this.showToast('Correo enviado para restablecer la contraseña');
      this.step = 2;
    } catch (error: any) {
      console.error(error);
      const code = error?.code as string | undefined;

      if (code === 'auth/invalid-email') {
        this.emailTouched = true;
        this.emailError = 'Correo inválido.';
        return;
      }
      if (code === 'auth/user-not-found') {
        this.emailTouched = true;
        this.emailError = 'Usuario no encontrado.';
        return;
      }

      this.showToast(error.message || 'Error al enviar el correo');
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

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
