package dao;

import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;

public class Conexao {

    public java.sql.Connection conn = null;
    
    private String url = null;
    private String jdbcDriver = null;
    private String dataBaseName = null;
    private String dataBasePrefix = null;
    private String dabaBasePort = null;
    private String hostName = null;
    private String userName = null;
    private String password = null;

    public Conexao() {
        jdbcDriver = "org.gjt.mm.mysql.Driver";
        hostName = "127.0.0.1";
        userName = "root";
        password = "";
        dataBaseName = "scpa";
        dataBasePrefix = "jdbc:mysql://";
        dabaBasePort = "3306";
        url = dataBasePrefix + hostName + ":" + dabaBasePort + "/"
                + dataBaseName + "?useUnicode=true&characterEncoding=utf8";
    }

    public java.sql.Connection getConnection() {
        try {
            if (conn == null) {
                Class.forName(jdbcDriver);
                conn = DriverManager.getConnection(url, userName, password);
            } else if (conn.isClosed()) {
                conn = null;
                return getConnection();
            }
        } catch (ClassNotFoundException e) {
            e.printStackTrace();
        } catch (SQLException e) {
            e.printStackTrace();
        }
        return conn;
    }

    
    public void closeConnection() {
        if (conn != null) {
            try {
                conn.close();
            } catch (SQLException e) {
                e.printStackTrace();
            }
        }
    }

    public static void main(String[] args) throws SQLException {
        Conexao conn = new Conexao();
        java.sql.Statement ps = conn.getConnection().createStatement();
        ResultSet result;
        String query = "select * from teste";
        result = ps.executeQuery(query);
        result.next();
        String nome = result.getString("nome_teste");
        System.out.print(nome);
        conn.closeConnection();

    }
}