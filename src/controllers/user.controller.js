const userService = require('../services/user.service');
const logger = require('../config/logger');

const listUsers = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      role: req.query.role,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    };

    const { users, total, page, limit } = await userService.listUsers(filters);
    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    logger.error('Error listando usuarios:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar los usuarios'
    });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Error obteniendo usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error al buscar el usuario'
    });
  }
};

const createUser = async (req, res) => {
  try {
    const required = ['name', 'email', 'role'];
    for (const field of required) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          error: `El campo ${field} es obligatorio`
        });
      }
    }

    const user = await userService.createUser(req.body);
    res.status(201).json({
      success: true,
      message: 'Usuario creado',
      data: user
    });
  } catch (error) {
    logger.error('Error creando usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear el usuario'
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const updates = req.body;
    const user = await userService.updateUser(req.params.id, updates);
    res.json({
      success: true,
      message: 'Usuario actualizado',
      data: user
    });
  } catch (error) {
    logger.error('Error actualizando usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar el usuario'
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const deleted = await userService.deleteUser(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Usuario eliminado'
    });
  } catch (error) {
    logger.error('Error eliminando usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar the usuario'
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'El correo es obligatorio'
      });
    }

    const user = await userService.getUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    // Por ahora, como no hay campo de password en la DB, aceptamos cualquier password
    // o validamos contra el apiKey si el usuario lo ingresa como password
    // Pero para facilitar el "Ver Datos Reales", simplemente devolvemos el usuario

    res.json({
      success: true,
      message: 'Sesión iniciada correctamente',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          clientId: user.clientName, // Usamos clientName como clientId para el frontend
          status: user.status
        },
        token: user.apiKey || process.env.API_KEY // Devolvemos su apiKey como token
      }
    });
  } catch (error) {
    logger.error('Error en login:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar sesión'
    });
  }
};

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  login,
};
