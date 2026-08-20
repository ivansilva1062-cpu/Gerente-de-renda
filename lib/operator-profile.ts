/*
 * PERFIL OPERACIONAL DO GERENTE DE RENDA
 *
 * IMPORTANTE:
 * Este arquivo NÃO guarda os dados pessoais.
 * Os dados reais serão colocados nas variáveis
 * de ambiente da Vercel.
 */

export type OperatorProfile = {
  fullName: string
  email: string
  phone: string
  birthDate: string

  address: {
    street: string
    number: string
    complement: string
    neighborhood: string
    city: string
    state: string
    zipCode: string
    country: string
  }

  payment: {
    pixKey: string
  }
}

function required(
  name: string,
): string {
  const value =
    process.env[name]

  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}`,
    )
  }

  return value
}

export function getOperatorProfile():
  OperatorProfile {
  return {
    fullName:
      required(
        'OPERATOR_NAME',
      ),

    email:
      required(
        'OPERATOR_EMAIL',
      ),

    phone:
      required(
        'OPERATOR_PHONE',
      ),

    birthDate:
      required(
        'OPERATOR_BIRTH_DATE',
      ),

    address: {
      street:
        required(
          'OPERATOR_ADDRESS_STREET',
        ),

      number:
        required(
          'OPERATOR_ADDRESS_NUMBER',
        ),

      complement:
        process.env
          .OPERATOR_ADDRESS_COMPLEMENT ??
        '',

      neighborhood:
        required(
          'OPERATOR_ADDRESS_NEIGHBORHOOD',
        ),

      city:
        required(
          'OPERATOR_ADDRESS_CITY',
        ),

      state:
        required(
          'OPERATOR_ADDRESS_STATE',
        ),

      zipCode:
        required(
          'OPERATOR_ADDRESS_ZIP',
        ),

      country:
        process.env
          .OPERATOR_ADDRESS_COUNTRY ??
        'BR',
    },

    payment: {
      pixKey:
        required(
          'OPERATOR_PIX_KEY',
        ),
    },
  }
}
