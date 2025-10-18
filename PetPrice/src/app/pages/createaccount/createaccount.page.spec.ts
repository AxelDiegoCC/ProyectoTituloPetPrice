import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreateaccountPage } from './createaccount.page';

describe('CreateaccountPage', () => {
  let component: CreateaccountPage;
  let fixture: ComponentFixture<CreateaccountPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CreateaccountPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
