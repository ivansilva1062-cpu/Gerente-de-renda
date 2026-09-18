import assert from 'node:assert/strict'
import test from 'node:test'

import {
  detectPixKeyType,
  isValidPixKey,
  preparePixTransfer,
  validatePixAmount,
  validatePixDescription,
  DEFAULT_MAX_PIX_AMOUNT,
} from './pix.ts'

const account = {
  bankName: 'Banco Exemplo',
  accountHolder: 'Maria Souza',
  accountNumber: '12345-6',
  agency: '0001',
  pixKey: 'maria@example.com',
}

test('detecta chave Pix do tipo e-mail, telefone, aleatória, CPF e CNPJ', () => {
  assert.equal(detectPixKeyType('maria@example.com'), 'email')
  assert.equal(detectPixKeyType('+5511999998888'), 'phone')
  assert.equal(detectPixKeyType('3fa85f64-5717-4562-b3fc-2c963f66afa6'), 'random')
  assert.equal(detectPixKeyType('529.982.247-25'), 'cpf')
  assert.equal(detectPixKeyType('11.222.333/0001-81'), 'cnpj')
})

test('rejeita chaves Pix inválidas ou em formato desconhecido', () => {
  assert.equal(isValidPixKey('123'), false)
  assert.equal(isValidPixKey('111.111.111-11'), false)
  assert.equal(isValidPixKey('não-é-chave'), false)
})

test('valida valor do Pix: positivo, duas casas decimais e dentro do limite', () => {
  assert.equal(validatePixAmount(100), null)
  assert.match(validatePixAmount(0) ?? '', /maior que zero/)
  assert.match(validatePixAmount(10.999) ?? '', /duas casas decimais/)
  assert.match(validatePixAmount(DEFAULT_MAX_PIX_AMOUNT + 1) ?? '', /excede o limite/)
})

test('valida descrição do Pix: obrigatória e com tamanho máximo', () => {
  assert.match(validatePixDescription('') ?? '', /descrição/)
  assert.equal(validatePixDescription('Pagamento de serviço'), null)
  assert.match(validatePixDescription('a'.repeat(200)) ?? '', /não pode ter mais/)
})

test('prepara transferência Pix preenchendo automaticamente a conta autorizada', () => {
  const result = preparePixTransfer(
    {
      direction: 'send',
      recipientKey: 'destinatario@example.com',
      recipientName: 'João Pagamento',
      amount: 150.5,
      description: 'Pagamento de serviço freelance',
    },
    account,
  )

  assert.equal(result.valid, true)
  if (result.valid) {
    assert.equal(result.prepared.senderAccountHolder, 'Maria Souza')
    assert.equal(result.prepared.senderPixKey, 'maria@example.com')
    assert.equal(result.prepared.recipientKeyType, 'email')
    assert.equal(result.prepared.amount, 150.5)
  }
})

test('bloqueia preparação quando não há conta autorizada cadastrada', () => {
  const result = preparePixTransfer(
    {
      direction: 'send',
      recipientKey: 'destinatario@example.com',
      amount: 50,
      description: 'Teste',
    },
    {},
  )

  assert.equal(result.valid, false)
  if (!result.valid) {
    assert.ok(result.errors.some((error) => /conta autorizada/.test(error)))
  }
})

test('bloqueia preparação com chave Pix do destinatário inválida', () => {
  const result = preparePixTransfer(
    {
      direction: 'send',
      recipientKey: 'chave-invalida',
      amount: 50,
      description: 'Teste',
    },
    account,
  )

  assert.equal(result.valid, false)
  if (!result.valid) {
    assert.ok(result.errors.some((error) => /Chave Pix/.test(error)))
  }
})
