import { Injectable } from '@angular/core';
import { Auth, onAuthStateChanged, User } from '@angular/fire/auth';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UserService {
  private userSubject = new BehaviorSubject<User | null>(null);
  public user$ = this.userSubject.asObservable();

  constructor(private auth: Auth) {
    // Escucha cambios de sesión en Firebase
    onAuthStateChanged(this.auth, (user) => {
      this.userSubject.next(user);
    });
  }

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  // 🔹 Método para actualizar manualmente el usuario después de login
  updateCurrentUser(user: User | null) {
    this.userSubject.next(user);
  }
}
